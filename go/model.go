/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

// Package model is a Go port of @voxgig/model. It unifies .jsonic source
// into a single model (via the aontu engine) and runs generator "actions"
// over it, once or in a rebuild-on-change watch loop.
//
// The TypeScript implementation in ts/ is canonical; this package is kept in
// architectural parity. Two mechanisms differ by necessity: action functions
// are registered programmatically (Go cannot require() code at runtime),
// though the .model-config file still declares which actions run and in what
// order; and watching polls modification times (rather than using chokidar).
package model

import (
	"path/filepath"
	"time"
)

// Version is the released version of the Go module. It is rewritten by
// `make publish-go V=x.y.z` to match the git tag (go/vx.y.z).
const Version = "0.1.1"

// DefaultIdle is the default watch debounce period.
const DefaultIdle = 111 * time.Millisecond

// Model unifies a .jsonic model and runs producers (the model writer and any
// registered actions) over it. It can build once or watch and rebuild, and
// resolves a .model-config/model-config.jsonic config (auto-created when
// missing) that declares the action order.
type Model struct {
	config *Config
	build  *Build
	watch  *Watch
	log    Log
}

// New creates a Model from a spec.
func New(spec ModelSpec) *Model {
	log := spec.Log
	if log == nil {
		log = NopLog{}
	}

	base := spec.Base
	if base == "" && spec.Path != "" {
		base = filepath.Dir(spec.Path)
	}

	idle := spec.Idle
	if idle <= 0 {
		idle = DefaultIdle
	}

	config := newConfig(base, spec, log)

	build := NewBuild(BuildSpec{
		Name:     "model",
		Path:     spec.Path,
		Base:     base,
		Args:     spec.Args,
		Dryrun:   spec.Dryrun,
		Resolver: spec.Resolver,
		Actions:  spec.Actions,
		Order:    spec.Order,
		Idle:     idle,
		Watch:    spec.Watch,
		Log:      log,
		Res: []ProducerDef{
			{Path: "/", Build: ModelProducer},
			{Path: "/", Build: LocalProducer},
		},
	})
	build.Use["config"] = config

	m := &Model{
		config: config,
		build:  build,
		watch:  NewWatch(build, "model", idle),
		log:    log,
	}

	// Re-resolve the config on each watch rebuild so config edits are picked up.
	m.watch.reload = func() {
		config.build.InvalidateCache()
		config.Run()
	}

	return m
}

// Run builds the config and then the model once, returning the model result.
// A failed config build is returned instead.
func (m *Model) Run() *BuildResult {
	if cr := m.config.Run(); !cr.OK {
		return cr
	}
	return m.watch.Run(false)
}

// Start builds once (config then model), then watches and rebuilds until Stop
// is called. It returns the initial model result.
func (m *Model) Start() *BuildResult {
	if cr := m.config.Run(); !cr.OK {
		return cr
	}
	return m.watch.Start()
}

// Stop ends watching and releases the watcher.
func (m *Model) Stop() { m.watch.Stop() }

// Build returns the underlying model Build (valid after Run or Start).
func (m *Model) Build() *Build { return m.build }

// Config returns the model's config build.
func (m *Model) Config() *Config { return m.config }
