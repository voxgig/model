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
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	model "github.com/voxgig/model/go"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stderr))
}

// run parses args and builds the model, returning a process exit code. It is
// separated from main (which only adds os.Exit and signal handling) so the
// behavior can be tested directly.
func run(args []string, stderr io.Writer) int {
	if len(args) > 0 && args[0] == "init" {
		return runInit(args[1:], stderr)
	}

	fs := flag.NewFlagSet("voxgig-model", flag.ContinueOnError)
	fs.SetOutput(stderr)
	watch := fs.Bool("w", false, "watch and rebuild on change")
	dryrun := fs.Bool("y", false, "dry run (write nothing to disk)")
	level := fs.String("g", "info", "log level: trace|debug|info|warn|error|silent")
	fs.Usage = func() {
		fmt.Fprintln(stderr, "usage: voxgig-model [-w] [-y] [-g level] <root-file>")
		fs.PrintDefaults()
	}
	if err := fs.Parse(args); err != nil {
		return 2
	}

	path := fs.Arg(0)
	if path == "" {
		fs.Usage()
		return 1
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		fmt.Fprintln(stderr, "ERROR:", err)
		return 1
	}
	if _, serr := os.Stat(abs); serr != nil {
		fmt.Fprintln(stderr, "ERROR: model file does not exist:", path)
		return 1
	}

	m := model.New(model.ModelSpec{
		Path:   abs,
		Base:   filepath.Dir(abs),
		Dryrun: *dryrun,
		Log:    model.NewLog(*level),
	})

	if *watch {
		reportErrs(m.Start(), stderr)
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
		<-sig
		m.Stop()
		return 0
	}

	if br := m.Run(); !br.OK {
		reportErrs(br, stderr)
		return 1
	}
	return 0
}

// runInit scaffolds a starter model and config under <dir>/model.
func runInit(args []string, out io.Writer) int {
	dir := "."
	if len(args) > 0 && args[0] != "" {
		dir = args[0]
	}
	created, skipped, err := model.Init(dir)
	if err != nil {
		fmt.Fprintln(out, "ERROR:", err)
		return 1
	}
	for _, p := range created {
		fmt.Fprintln(out, "created:", p)
	}
	for _, p := range skipped {
		fmt.Fprintln(out, "exists: ", p)
	}
	fmt.Fprintln(out, "Next: voxgig-model "+filepath.Join(dir, "model", "model.jsonic"))
	return 0
}

func reportErrs(br *model.BuildResult, stderr io.Writer) {
	if br == nil {
		return
	}
	for _, e := range br.Errs {
		fmt.Fprintln(stderr, "ERROR:", e)
	}
}
