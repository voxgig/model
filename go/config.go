/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	configFile       = "model-config.aontu"
	legacyConfigFile = "model-config.aon"

	includeQuotes = "\"'`"
	includeSpace  = " \t\r\n"
)

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

type Config struct {
	build *Build
	log   Log
}

// newConfig sets up (and bootstraps) the config build for a model base.
func newConfig(base string, spec ModelSpec, log Log) *Config {
	cbase := filepath.Join(base, ".model-config")
	cpath := filepath.Join(cbase, configFile)

	cb := NewBuild(BuildSpec{
		Name:     "config",
		Path:     cpath,
		Base:     cbase,
		Dryrun:   spec.Dryrun,
		Resolver: spec.Resolver,
		Log:      log,
		Res:      []ProducerDef{{Path: "/", Build: ModelProducer}},
	})

	prepareConfig(cb.FS, cbase, spec.Dryrun, log)
	return &Config{build: cb, log: log}
}

// prepareConfig creates the config when there is none, migrating a legacy
// model-config.aon forward if one is present. Writes go through fs, so a
// dryrun keeps them in memory and leaves the legacy file in place.
func prepareConfig(fs FS, cbase string, dryrun bool, log Log) {
	cpath := filepath.Join(cbase, configFile)
	legacy := filepath.Join(cbase, legacyConfigFile)

	if _, err := fs.Stat(cpath); err == nil {
		if _, lerr := fs.Stat(legacy); lerr == nil {
			log.Info("config-legacy-ignored",
				"ignoring "+legacy+": "+cpath+" takes precedence")
		}
		return
	}

	src := []byte(configStub)
	old, rerr := fs.ReadFile(legacy)
	migrate := rerr == nil
	if migrate {
		src = []byte(rewriteAonIncludes(string(old)))
	}

	_ = fs.MkdirAll(cbase, 0o755)
	if werr := fs.WriteFile(cpath, src, 0o644); werr != nil || !migrate {
		return
	}

	if dryrun {
		log.Info("config-migrate", "migrated "+legacy+" to "+cpath+" (dry run: in memory only)")
		return
	}
	log.Info("config-migrate", "migrated "+legacy+" to "+cpath)
	_ = os.Remove(legacy)
}

// rewriteAonIncludes points each include of a .aon file at its .aontu
// successor. Strings and comments are skipped, so a path held as data or
// commented out is kept.
func rewriteAonIncludes(src string) string {
	var out strings.Builder
	i := 0

	for i < len(src) {
		c := src[i]
		end := i + 1
		retarget := false

		switch {
		case c == '#':
			end = strings.IndexByte(src[i:], '\n')
			if end < 0 {
				end = len(src)
			} else {
				end += i
			}
		case strings.IndexByte(includeQuotes, c) >= 0:
			end, _ = stringEnd(src, i)
		case c == '@':
			q := end
			for q < len(src) && strings.IndexByte(includeSpace, src[q]) >= 0 {
				q++
			}
			if q < len(src) && strings.IndexByte(includeQuotes, src[q]) >= 0 {
				var closed bool
				end, closed = stringEnd(src, q)
				retarget = closed && strings.HasSuffix(src[q+1:end-1], ".aon")
			}
		}

		if retarget {
			out.WriteString(src[i : end-1])
			out.WriteString("tu")
			out.WriteByte(src[end-1])
		} else {
			out.WriteString(src[i:end])
		}
		i = end
	}

	return out.String()
}

// stringEnd finds where the string opening at start ends: at an unescaped
// closing quote, or, unterminated, at its line; a backtick string may span
// lines.
func stringEnd(src string, start int) (end int, closed bool) {
	quote := src[start]
	i := start + 1
	for i < len(src) {
		switch c := src[i]; {
		case c == '\\':
			i += 2
		case c == quote:
			return i + 1, true
		case c == '\n' && quote != '`':
			return i, false
		default:
			i++
		}
	}
	return len(src), false
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
