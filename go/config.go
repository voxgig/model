/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
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
	prep  configPrep
}

// configFS is the filesystem the config is prepared through.
type configFS interface {
	FS
	Rename(oldpath, newpath string) error
	Remove(name string) error
}

// configPrep is what the Model prepared before the config build: a failure
// to report, or, for a dryrun, the config text to serve and the legacy file
// it comes from.
type configPrep struct {
	err  error
	text func() ([]byte, error)
	from string
}

// newConfig sets up (and bootstraps) the config build for a model base.
func newConfig(base string, spec ModelSpec, log Log) *Config {
	cbase := filepath.Join(base, ".model-config")
	cpath := filepath.Join(cbase, configFile)

	prep := prepareConfig(OSFS{}, cbase, spec.Dryrun, log)

	bspec := BuildSpec{
		Name:     "config",
		Path:     cpath,
		Base:     cbase,
		Dryrun:   spec.Dryrun,
		Resolver: spec.Resolver,
		Log:      log,
		Res:      []ProducerDef{{Path: "/", Build: ModelProducer}},
	}
	if prep.text != nil {
		bspec.FS = readBackFS{FS: newDryFS(), path: cpath, text: prep.text, from: prep.from}
	}

	return &Config{build: NewBuild(bspec), log: log, prep: prep}
}

// prepareConfig creates the config when there is none, migrating a legacy
// model-config.aon forward if one is present. A dryrun writes nothing: the
// config text is derived afresh from its source on every read instead.
func prepareConfig(fs configFS, cbase string, dryrun bool, log Log) configPrep {
	cpath := filepath.Join(cbase, configFile)
	legacy := filepath.Join(cbase, legacyConfigFile)

	if _, err := fs.Stat(cpath); err == nil {
		if _, lerr := fs.Stat(legacy); lerr == nil {
			log.Info("config-legacy-ignored",
				"ignoring "+legacy+": "+cpath+" takes precedence")
		}
		return configPrep{}
	}

	old, rerr := fs.ReadFile(legacy)
	if rerr != nil && !errors.Is(rerr, os.ErrNotExist) {
		return configPrep{err: configError("cannot read "+legacy, rerr)}
	}
	migrate := rerr == nil

	if migrate {
		note := "migrated " + legacy + " to " + cpath
		if dryrun {
			note += " (dry run: in memory only)"
		}
		log.Info("config-migrate", note)
	}

	if dryrun {
		if !migrate {
			return configPrep{text: func() ([]byte, error) { return []byte(configStub), nil }}
		}
		return configPrep{from: legacy, text: func() ([]byte, error) {
			src, err := fs.ReadFile(legacy)
			if err != nil {
				return nil, err
			}
			return []byte(rewriteAonIncludes(string(src))), nil
		}}
	}

	src := []byte(configStub)
	if migrate {
		src = []byte(rewriteAonIncludes(string(old)))
	}
	err := fs.MkdirAll(cbase, 0o755)
	if err == nil {
		err = writeAtomic(fs, cpath, src)
	}
	if err != nil {
		return configPrep{err: configError("cannot write "+cpath, err)}
	}

	if migrate {
		_ = fs.Remove(legacy)
	}
	return configPrep{}
}

func configError(what string, cause error) error {
	return fmt.Errorf("model config: %s: %w", what, cause)
}

// writeAtomic lands data beside path and renames it over, so a reader never
// sees a partial file.
func writeAtomic(fs configFS, path string, data []byte) error {
	tmp := path + "." + strconv.Itoa(os.Getpid()) + "." +
		strconv.FormatInt(time.Now().UnixNano(), 36) + ".tmp"
	err := fs.WriteFile(tmp, data, 0o644)
	if err == nil {
		err = fs.Rename(tmp, path)
	}
	if err != nil {
		_ = fs.Remove(tmp)
	}
	return err
}

// readBackFS serves a dryrun's config from memory, derived on every read. Its
// mtime is that of the legacy source, so an edit there invalidates the build
// cache.
type readBackFS struct {
	FS
	path string
	text func() ([]byte, error)
	from string
}

func (r readBackFS) ReadFile(name string) ([]byte, error) {
	if filepath.Clean(name) == filepath.Clean(r.path) {
		return r.text()
	}
	return r.FS.ReadFile(name)
}

func (r readBackFS) Stat(name string) (os.FileInfo, error) {
	if r.from != "" && filepath.Clean(name) == filepath.Clean(r.path) {
		return os.Stat(r.from)
	}
	return r.FS.Stat(name)
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
func (c *Config) Run() *BuildResult {
	if c.prep.err != nil {
		return &BuildResult{OK: false, Errs: []error{c.prep.err}}
	}
	return c.build.Run(false)
}

// Model returns the resolved config model (valid after Run).
func (c *Config) Model() map[string]any {
	if c == nil || c.build == nil {
		return nil
	}
	return c.build.Model
}
