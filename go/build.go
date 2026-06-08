/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"fmt"
	"os"
	"sync"

	aontu "github.com/rjrodger/aontu/go"
)

// Resolver turns model source text into a unified model. The default
// implementation uses the aontu CUE engine; callers may supply their own
// (for example to unify from a non-file source, or in tests).
type Resolver interface {
	Resolve(src string) (model map[string]any, errs []error)
}

// chdirMu serializes the working-directory changes AontuResolver needs to
// resolve @"..." imports relative to a model's base directory.
var chdirMu sync.Mutex

// AontuResolver resolves source with the aontu engine. The Go aontu API has
// no base-directory parameter, so imports are resolved relative to Base by
// briefly changing the working directory (serialized across builds).
type AontuResolver struct {
	Base string
}

// Resolve implements Resolver.
func (r AontuResolver) Resolve(src string) (map[string]any, []error) {
	chdirMu.Lock()
	defer chdirMu.Unlock()

	if r.Base != "" {
		if prev, err := os.Getwd(); err == nil {
			if cerr := os.Chdir(r.Base); cerr == nil {
				defer func() { _ = os.Chdir(prev) }()
			}
		}
	}

	out, err := aontu.New().Generate(src)
	if err != nil {
		return nil, []error{err}
	}
	if out == nil {
		return map[string]any{}, nil
	}
	m, ok := out.(map[string]any)
	if !ok {
		return nil, []error{fmt.Errorf("model did not resolve to an object (got %T)", out)}
	}
	return m, nil
}

// Build resolves a model and runs a producer pipeline over it.
type Build struct {
	ID     string
	Path   string
	Base   string
	Model  map[string]any
	Args   map[string]any
	Dryrun bool
	FS     FS
	Log    Log
	Use    map[string]any
	Errs   []error
	Ctx    BuildContext

	spec     BuildSpec
	pdef     []ProducerDef
	resolver Resolver
	cacheSig map[string]int64
}

var (
	buildSeq   int64
	buildSeqMu sync.Mutex
)

// NewBuild creates a Build from a spec, filling in defaults (an os- or
// dryrun-backed FS, a no-op logger, and the aontu resolver).
func NewBuild(spec BuildSpec) *Build {
	buildSeqMu.Lock()
	buildSeq++
	id := buildSeq
	buildSeqMu.Unlock()

	fs := spec.FS
	if fs == nil {
		if spec.Dryrun {
			fs = newDryFS()
		} else {
			fs = OSFS{}
		}
	}
	log := spec.Log
	if log == nil {
		log = NopLog{}
	}
	resolver := spec.Resolver
	if resolver == nil {
		resolver = AontuResolver{Base: spec.Base}
	}

	return &Build{
		ID:       fmt.Sprintf("%06d", id),
		Path:     spec.Path,
		Base:     spec.Base,
		Args:     spec.Args,
		Dryrun:   spec.Dryrun,
		FS:       fs,
		Log:      log,
		Use:      map[string]any{},
		spec:     spec,
		pdef:     spec.Res,
		resolver: resolver,
	}
}

// Run performs one build: resolve the model, run the producer pipeline in
// the pre phase, re-resolve if a producer requested a reload, then run the
// pipeline in the post phase. Per-run error state is reset so a reused Build
// does not carry failures between runs.
func (b *Build) Run(watch bool) *BuildResult {
	b.Errs = nil
	b.Ctx = BuildContext{Step: StepPre, Watch: watch, State: map[string]any{}}

	runlog := []string{}
	var plog []ProducerResult
	hasErr := false

	runlog = append(runlog, "model:initial")
	if b.resolveModel() {
		hasErr = true
	}

	forceReload := false
	if !hasErr {
		for _, pd := range b.pdef {
			pr := b.runProducer(pd)
			plog = append(plog, pr)
			forceReload = forceReload || pr.Reload
			runlog = append(runlog, "producer:pre:"+pr.Name)
			if !pr.OK {
				hasErr = true
				break
			}
		}
	}

	if forceReload && !hasErr {
		runlog = append(runlog, "model:full")
		if b.resolveModel() {
			hasErr = true
		}
	}

	if !hasErr {
		b.Ctx.Step = StepPost
		for _, pd := range b.pdef {
			pr := b.runProducer(pd)
			plog = append(plog, pr)
			runlog = append(runlog, "producer:post:"+pr.Name)
			if !pr.OK {
				hasErr = true
				break
			}
		}
	}

	return &BuildResult{
		OK:        !hasErr,
		Errs:      b.Errs,
		Runlog:    runlog,
		Producers: plog,
		build:     b,
	}
}

// runProducer runs a producer, converting a panic into a failed result so a
// single misbehaving producer cannot crash the build.
func (b *Build) runProducer(pd ProducerDef) (pr ProducerResult) {
	defer func() {
		if r := recover(); r != nil {
			err, ok := r.(error)
			if !ok {
				err = fmt.Errorf("%v", r)
			}
			b.Errs = append(b.Errs, err)
			pr = ProducerResult{OK: false, Step: b.Ctx.Step, Errs: []error{err}}
		}
	}()
	pr = pd.Build(b, &b.Ctx)
	if !pr.OK && len(pr.Errs) > 0 {
		b.Errs = append(b.Errs, pr.Errs...)
	}
	return pr
}

// resolveModel reads and unifies the root model. A successful result is
// cached by the root file's modification time and reused while unchanged.
//
// Note: the Go aontu engine does not report the imports it followed, so the
// cache tracks only the root file. Watchers call InvalidateCache when any
// watched source changes, so imported-file edits still rebuild.
func (b *Build) resolveModel() (hasErr bool) {
	if b.Model != nil && b.cacheSig != nil && b.cacheHit() {
		return false
	}

	src, err := b.FS.ReadFile(b.Path)
	if err != nil {
		b.Errs = append(b.Errs, err)
		b.cacheSig = nil
		return true
	}

	model, errs := b.resolver.Resolve(string(src))
	if len(errs) > 0 {
		b.Errs = append(b.Errs, errs...)
		b.cacheSig = nil
		return true
	}

	b.Model = model
	b.cacheSig = map[string]int64{b.Path: mtime(b.FS, b.Path)}
	return false
}

// InvalidateCache forces the next resolveModel to re-read and re-unify.
func (b *Build) InvalidateCache() { b.cacheSig = nil }

func (b *Build) cacheHit() bool {
	for path, prev := range b.cacheSig {
		if mtime(b.FS, path) != prev {
			return false
		}
	}
	return true
}

func mtime(fs FS, path string) int64 {
	info, err := fs.Stat(path)
	if err != nil {
		return -1
	}
	return info.ModTime().UnixNano()
}
