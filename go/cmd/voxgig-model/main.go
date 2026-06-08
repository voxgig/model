/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

// Command voxgig-model unifies a .jsonic model and writes the resulting
// model JSON. It mirrors the core of the TypeScript CLI. Custom build
// actions — which the TypeScript CLI loads dynamically from a config file —
// are not available here, because Go cannot load code at runtime; embed the
// model package and register actions programmatically to use them.
package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	model "github.com/voxgig/model/go"
)

func main() {
	watch := flag.Bool("w", false, "watch and rebuild on change")
	dryrun := flag.Bool("y", false, "dry run (write nothing to disk)")
	level := flag.String("g", "info", "log level: trace|debug|info|warn|error|silent")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: voxgig-model [-w] [-y] [-g level] <root-file>")
		flag.PrintDefaults()
	}
	flag.Parse()

	path := flag.Arg(0)
	if path == "" {
		flag.Usage()
		os.Exit(1)
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		fmt.Fprintln(os.Stderr, "ERROR:", err)
		os.Exit(1)
	}
	if _, serr := os.Stat(abs); serr != nil {
		fmt.Fprintln(os.Stderr, "ERROR: model file does not exist:", path)
		os.Exit(1)
	}

	m := model.New(model.ModelSpec{
		Path:   abs,
		Base:   filepath.Dir(abs),
		Dryrun: *dryrun,
		Log:    model.NewLog(*level),
	})

	if *watch {
		br := m.Start()
		reportErrs(br)
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		m.Stop()
		return
	}

	br := m.Run()
	if !br.OK {
		reportErrs(br)
		os.Exit(1)
	}
}

func reportErrs(br *model.BuildResult) {
	if br == nil {
		return
	}
	for _, e := range br.Errs {
		fmt.Fprintln(os.Stderr, "ERROR:", e)
	}
}
