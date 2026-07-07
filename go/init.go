/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
)

const starterModel = "# Voxgig model. Edit this file, then build it:\n" +
	"#   voxgig-model model/model.aontu\n" +
	"#\n" +
	"# Models are unified .aontu - add types, defaults, references, imports.\n" +
	"# Tutorial: https://github.com/voxgig/model/blob/main/docs/tutorial.md\n" +
	"\n" +
	"name: 'my-model'\n"

const starterConfig = "# Model configuration. Declare build actions and their order here.\n" +
	"#\n" +
	"# Example (TypeScript loads the module; Go binds the name to a func\n" +
	"# registered in ModelSpec.Actions):\n" +
	"#   sys: model: action: { example: load: 'build/example' }\n" +
	"#   sys: model: order: action: 'example'\n" +
	"\n" +
	"sys: model: action: {}\n" +
	"sys: model: order: action: *''\n"

// Init scaffolds a starter model and config under <dir>/model. Existing files
// are left untouched. It returns the paths created and the paths skipped.
func Init(dir string) (created, skipped []string, err error) {
	if dir == "" {
		dir = "."
	}
	files := []struct{ path, content string }{
		{filepath.Join(dir, "model", "model.aontu"), starterModel},
		{filepath.Join(dir, "model", ".model-config", "model-config.aontu"), starterConfig},
	}
	for _, f := range files {
		if _, serr := os.Stat(f.path); serr == nil {
			skipped = append(skipped, f.path)
			continue
		}
		if merr := os.MkdirAll(filepath.Dir(f.path), 0o755); merr != nil {
			return created, skipped, merr
		}
		if werr := os.WriteFile(f.path, []byte(f.content), 0o644); werr != nil {
			return created, skipped, werr
		}
		created = append(created, f.path)
	}
	return created, skipped, nil
}
