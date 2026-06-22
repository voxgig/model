/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestCLIWritesModel(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "m.jsonic")
	write(t, root, "a: 1\nb: 2\n")

	var out bytes.Buffer
	if code := run([]string{"-g", "silent", root}, &out); code != 0 {
		t.Fatalf("exit %d: %s", code, out.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); err != nil {
		t.Fatalf("model JSON not written: %v", err)
	}
}

func TestCLINoConfigSkipsConfig(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "m.jsonic")
	write(t, root, "a: 1\n")

	var out bytes.Buffer
	if code := run([]string{"-no-config", "-g", "silent", root}, &out); code != 0 {
		t.Fatalf("exit %d: %s", code, out.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); err != nil {
		t.Fatalf("model JSON not written: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, ".model-config")); !os.IsNotExist(err) {
		t.Fatal("-no-config should not create .model-config")
	}
}

func TestCLIDryrunWritesNothing(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "m.jsonic")
	write(t, root, "a: 1\n")

	var out bytes.Buffer
	if code := run([]string{"-y", "-g", "silent", root}, &out); code != 0 {
		t.Fatalf("exit %d: %s", code, out.String())
	}
	if _, err := os.Stat(filepath.Join(dir, "m.json")); !os.IsNotExist(err) {
		t.Fatal("dryrun wrote m.json to disk")
	}
}

func TestCLIMissingFile(t *testing.T) {
	var out bytes.Buffer
	code := run([]string{filepath.Join(t.TempDir(), "nope.jsonic")}, &out)
	if code == 0 {
		t.Fatal("expected non-zero exit for missing file")
	}
	if !strings.Contains(out.String(), "does not exist") {
		t.Fatalf("stderr = %q", out.String())
	}
}

func TestCLINoArgs(t *testing.T) {
	var out bytes.Buffer
	if code := run(nil, &out); code != 1 {
		t.Fatalf("exit %d, want 1", code)
	}
}

func TestCLIBadModel(t *testing.T) {
	dir := t.TempDir()
	root := filepath.Join(dir, "m.jsonic")
	write(t, root, "x: 1\nx: 2\n")

	var out bytes.Buffer
	code := run([]string{"-g", "silent", root}, &out)
	if code != 1 {
		t.Fatalf("exit %d, want 1", code)
	}
	if !strings.Contains(out.String(), "ERROR") {
		t.Fatalf("stderr = %q", out.String())
	}
}

func TestCLIInit(t *testing.T) {
	dir := t.TempDir()

	var out bytes.Buffer
	if code := run([]string{"init", dir}, &out); code != 0 {
		t.Fatalf("init exit %d: %s", code, out.String())
	}
	if !strings.Contains(out.String(), "created:") {
		t.Fatalf("init output = %q", out.String())
	}
	root := filepath.Join(dir, "model", "model.jsonic")
	if _, err := os.Stat(root); err != nil {
		t.Fatalf("init did not scaffold the model: %v", err)
	}

	// The scaffold should then build through the CLI.
	var out2 bytes.Buffer
	if code := run([]string{"-g", "silent", root}, &out2); code != 0 {
		t.Fatalf("building the scaffold exit %d: %s", code, out2.String())
	}
}
