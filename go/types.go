/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import "time"

// Step is a build phase.
type Step string

const (
	// StepPre runs before the model is finalized.
	StepPre Step = "pre"
	// StepPost runs after the model is finalized.
	StepPost Step = "post"
	// StepAll runs in both phases.
	StepAll Step = "all"
)

// BuildContext carries the current phase and shared state through one build.
type BuildContext struct {
	Step  Step
	Watch bool
	State map[string]any
}

// ProducerResult is what a producer reports for one phase.
type ProducerResult struct {
	OK     bool
	Name   string
	Step   Step
	Active bool
	Reload bool
	Errs   []error
	Runlog []string
}

// Producer transforms or emits output from the model during a build phase.
type Producer func(b *Build, ctx *BuildContext) ProducerResult

// ProducerDef pairs a producer with a (currently informational) path scope.
type ProducerDef struct {
	Path  string
	Build Producer
}

// BuildResult summarizes one build.
type BuildResult struct {
	OK        bool
	Errs      []error
	Runlog    []string
	Producers []ProducerResult

	build *Build
}

// Build returns the underlying Build (may be nil for a synthesized result).
func (r *BuildResult) Build() *Build {
	if r == nil {
		return nil
	}
	return r.build
}

// Action is a project-local generator run by LocalProducer. It receives the
// unified model and the build, and reports whether it succeeded and whether
// the model should be re-resolved.
type Action func(model map[string]any, b *Build, ctx *BuildContext) ActionResult

// ActionResult is what an Action reports.
type ActionResult struct {
	OK     bool
	Reload bool
}

// ActionDef registers an Action to run in a given step. Unlike the
// TypeScript port, which loads actions dynamically from a config file, Go
// actions are registered programmatically (Go cannot load code at runtime).
type ActionDef struct {
	Run  Action
	Step Step // StepPre, StepPost (the zero value defaults to post) or StepAll
}

// WatchModes selects which filesystem events trigger a rebuild.
type WatchModes struct {
	Mod bool
	Add bool
	Rem bool
}

// BuildSpec configures a Build.
type BuildSpec struct {
	Name     string
	Path     string
	Base     string
	Res      []ProducerDef
	Resolver Resolver
	Args     map[string]any
	Dryrun   bool
	FS       FS
	Actions  map[string]ActionDef
	Order    []string
	Idle     time.Duration
	Watch    WatchModes
	Log      Log
}

// ModelSpec configures a Model.
type ModelSpec struct {
	Path     string
	Base     string
	Args     map[string]any
	Dryrun   bool
	Resolver Resolver
	Actions  map[string]ActionDef
	Order    []string
	Idle     time.Duration
	Watch    WatchModes
	Log      Log

	// Config resolves a .model-config/model-config.jsonic (auto-created when
	// missing) that declares the build action order. A nil pointer defaults to
	// enabled; set it to a pointer-to-false to skip the config entirely and run
	// the model on its own (action order then comes from Order, else the
	// registered Actions).
	Config *bool
}
