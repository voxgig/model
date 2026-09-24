/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"path/filepath"
	"time"
)

const VERSION = "0.5.0"

const DefaultIdle = 111 * time.Millisecond

type Model struct {
	config *Config
	build  *Build
	watch  *Watch
	log    Log
}

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

	// Config is optional: a nil spec.Config defaults to enabled. When disabled,
	// the .model-config/ build is skipped and the model runs on its own.
	var config *Config
	if spec.Config == nil || *spec.Config {
		config = newConfig(base, spec, log)
	}

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
			// Checks message declarations (pre phase), so an inconsistent
			// main.msg fails the build before any output is written.
			{Path: "/", Build: MsgProducer},
			{Path: "/", Build: ModelProducer},
			{Path: "/", Build: LocalProducer},
		},
	})
	if config != nil {
		build.Use["config"] = config
	}

	m := &Model{
		config: config,
		build:  build,
		watch:  NewWatch(build, "model", idle),
		log:    log,
	}

	// Re-resolve the config on each watch rebuild so config edits are picked up.
	if config != nil {
		if config.prep.from != "" {
			m.watch.extra = []string{config.prep.from}
		}
		m.watch.reload = func() {
			config.build.InvalidateCache()
			config.Run()
		}
	}

	return m
}

// Run builds the config (when enabled) and then the model once, returning the
// model result. A failed config build is returned instead.
func (m *Model) Run() *BuildResult {
	if m.config != nil {
		if cr := m.config.Run(); !cr.OK {
			return cr
		}
	}
	return m.watch.Run(false)
}

// Start builds once (config when enabled, then model), then watches and
// rebuilds until Stop is called. It returns the initial model result.
func (m *Model) Start() *BuildResult {
	if m.config != nil {
		if cr := m.config.Run(); !cr.OK {
			return cr
		}
	}
	return m.watch.Start()
}

func (m *Model) Stop() { m.watch.Stop() }

// Build returns the underlying model Build (valid after Run or Start).
func (m *Model) Build() *Build { return m.build }

func (m *Model) Config() *Config { return m.config }
