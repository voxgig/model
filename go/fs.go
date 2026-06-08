/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"os"
	"path/filepath"
	"sync"
)

// FS is the filesystem seam used by builds, producers and actions. Writing
// through it (rather than the os package directly) lets a dryrun build
// redirect writes away from disk. It mirrors the role of the swappable fs in
// the TypeScript implementation.
type FS interface {
	ReadFile(name string) ([]byte, error)
	WriteFile(name string, data []byte, perm os.FileMode) error
	MkdirAll(path string, perm os.FileMode) error
	Stat(name string) (os.FileInfo, error)
}

// OSFS is the real, disk-backed filesystem.
type OSFS struct{}

// ReadFile reads a file from disk.
func (OSFS) ReadFile(name string) ([]byte, error) { return os.ReadFile(name) }

// WriteFile writes a file to disk.
func (OSFS) WriteFile(name string, data []byte, perm os.FileMode) error {
	return os.WriteFile(name, data, perm)
}

// MkdirAll creates a directory and any parents.
func (OSFS) MkdirAll(path string, perm os.FileMode) error { return os.MkdirAll(path, perm) }

// Stat returns file info from disk.
func (OSFS) Stat(name string) (os.FileInfo, error) { return os.Stat(name) }

// dryFS reads from the real filesystem but keeps writes in memory, so a
// dryrun build runs normally without touching disk.
type dryFS struct {
	mu  sync.Mutex
	mem map[string][]byte
}

func newDryFS() *dryFS { return &dryFS{mem: map[string][]byte{}} }

func (d *dryFS) ReadFile(name string) ([]byte, error) {
	key := filepath.Clean(name)
	d.mu.Lock()
	data, ok := d.mem[key]
	d.mu.Unlock()
	if ok {
		return append([]byte(nil), data...), nil
	}
	return os.ReadFile(name)
}

func (d *dryFS) WriteFile(name string, data []byte, _ os.FileMode) error {
	d.mu.Lock()
	d.mem[filepath.Clean(name)] = append([]byte(nil), data...)
	d.mu.Unlock()
	return nil
}

func (d *dryFS) MkdirAll(string, os.FileMode) error { return nil }

func (d *dryFS) Stat(name string) (os.FileInfo, error) { return os.Stat(name) }
