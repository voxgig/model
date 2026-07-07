/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import "path/filepath"

// configStub is written when a model has no config file yet. It is
// self-contained (no package import) so it resolves with the Go aontu engine,
// and mirrors the effective shape of the TypeScript default config.
const configStub = "# Model configuration. Declare build actions and their order here.\n" +
	"#\n" +
	"# Example (Go binds each declared action name to a func registered in\n" +
	"# ModelSpec.Actions):\n" +
	"#   sys: model: action: { example: load: 'build/example' }\n" +
	"#   sys: model: order: action: 'example'\n" +
	"\n" +
	"sys: model: action: {}\n" +
	"sys: model: order: action: *''\n"

// Config is the build for a model's .model-config/model-config.aontu. It
// mirrors the TypeScript Config: it resolves the config model, writes
// model-config.json, and is the source of the action order. The file is
// auto-created from configStub when missing.
type Config struct {
	build *Build
	log   Log
}

// newConfig sets up (and bootstraps) the config build for a model base.
func newConfig(base string, spec ModelSpec, log Log) *Config {
	cbase := filepath.Join(base, ".model-config")
	cpath := filepath.Join(cbase, "model-config.aontu")

	cb := NewBuild(BuildSpec{
		Name:     "config",
		Path:     cpath,
		Base:     cbase,
		Dryrun:   spec.Dryrun,
		Resolver: spec.Resolver,
		Log:      log,
		Res:      []ProducerDef{{Path: "/", Build: ModelProducer}},
	})

	ensureConfigFile(cb.FS, cpath, cbase)
	return &Config{build: cb, log: log}
}

// ensureConfigFile writes the default config stub if none exists. It uses the
// build's filesystem, so a dryrun keeps the stub in memory.
func ensureConfigFile(fs FS, cpath, cbase string) {
	if _, err := fs.Stat(cpath); err == nil {
		return
	}
	_ = fs.MkdirAll(cbase, 0o755)
	_ = fs.WriteFile(cpath, []byte(configStub), 0o644)
}

// Run resolves the config model and writes model-config.json.
func (c *Config) Run() *BuildResult { return c.build.Run(false) }

// Model returns the resolved config model (valid after Run).
func (c *Config) Model() map[string]any {
	if c == nil || c.build == nil {
		return nil
	}
	return c.build.Model
}
