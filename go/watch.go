/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// modelExts are the source extensions a watcher tracks. Generated output
// (e.g. .json) is deliberately excluded so writing it cannot loop.
var modelExts = map[string]bool{".jsonic": true, ".aon": true, ".aontu": true}

// Watch rebuilds a Build when its source files change. It polls modification
// times (stdlib only, no external dependency where the TypeScript port uses
// chokidar) and debounces bursts of changes by an idle quiet period.
type Watch struct {
	build *Build
	name  string
	idle  time.Duration

	mu      sync.Mutex
	last    *BuildResult
	sig     map[string]int64
	stop    chan struct{}
	done    chan struct{}
	running bool
}

// NewWatch creates a watcher for a build. A non-positive idle defaults to
// 111ms (matching the TypeScript default).
func NewWatch(b *Build, name string, idle time.Duration) *Watch {
	if idle <= 0 {
		idle = 111 * time.Millisecond
	}
	if name == "" {
		name = "model"
	}
	return &Watch{build: b, name: name, idle: idle}
}

// Run performs a single build and records the result.
func (w *Watch) Run(watch bool) *BuildResult {
	br := w.build.Run(watch)
	w.mu.Lock()
	w.last = br
	w.mu.Unlock()
	return br
}

// Last returns the most recent build result.
func (w *Watch) Last() *BuildResult {
	w.mu.Lock()
	defer w.mu.Unlock()
	return w.last
}

// Start runs an initial build, then watches the model's base directory and
// rebuilds after each quiet period. Call Stop to release it.
func (w *Watch) Start() *BuildResult {
	br := w.Run(true)

	w.mu.Lock()
	w.sig = w.snapshot()
	w.stop = make(chan struct{})
	w.done = make(chan struct{})
	w.running = true
	w.mu.Unlock()

	go w.loop()
	return br
}

// Stop ends watching and waits for the watch loop to exit.
func (w *Watch) Stop() {
	w.mu.Lock()
	running := w.running
	w.running = false
	stop := w.stop
	done := w.done
	w.mu.Unlock()
	if !running {
		return
	}
	close(stop)
	<-done
}

func (w *Watch) loop() {
	defer close(w.done)

	tick := w.idle / 2
	if tick <= 0 {
		tick = 50 * time.Millisecond
	}
	t := time.NewTicker(tick)
	defer t.Stop()

	var changedAt time.Time
	for {
		select {
		case <-w.stop:
			return
		case <-t.C:
			now := w.snapshot()

			w.mu.Lock()
			prev := w.sig
			w.mu.Unlock()

			if !sameSig(now, prev) {
				w.mu.Lock()
				w.sig = now
				w.mu.Unlock()
				changedAt = time.Now()
				continue
			}

			if !changedAt.IsZero() && time.Since(changedAt) >= w.idle {
				changedAt = time.Time{}
				w.build.InvalidateCache()
				w.Run(true)
				w.mu.Lock()
				w.sig = w.snapshot()
				w.mu.Unlock()
			}
		}
	}
}

// snapshot records the modification times of model source files under the
// build's base directory.
func (w *Watch) snapshot() map[string]int64 {
	sig := map[string]int64{}
	base := w.build.Base
	if base == "" {
		base = filepath.Dir(w.build.Path)
	}
	_ = filepath.WalkDir(base, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if modelExts[filepath.Ext(path)] {
			if info, serr := os.Stat(path); serr == nil {
				sig[path] = info.ModTime().UnixNano()
			}
		}
		return nil
	})
	return sig
}

func sameSig(a, b map[string]int64) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}
