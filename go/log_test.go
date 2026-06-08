/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"bytes"
	"errors"
	"strings"
	"testing"
)

func TestParseLevel(t *testing.T) {
	cases := map[string]int{
		"debug": levelDebug, "trace": levelDebug,
		"info": levelInfo, "": levelInfo, "nonsense": levelInfo,
		"warn": levelError, "error": levelError, "fatal": levelError,
		"silent": levelSilent,
	}
	for in, want := range cases {
		if got := parseLevel(in); got != want {
			t.Errorf("parseLevel(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestStdLogRespectsLevel(t *testing.T) {
	var buf bytes.Buffer
	l := &stdLog{level: levelInfo, w: &buf}

	l.Debug("dbg", "hidden") // below info -> suppressed
	l.Info("inf", "shown")
	l.Error("err", errors.New("boom"), "context")

	out := buf.String()
	if strings.Contains(out, "hidden") {
		t.Error("debug entry leaked at info level")
	}
	if !strings.Contains(out, "inf") || !strings.Contains(out, "shown") {
		t.Error("info entry not logged")
	}
	if !strings.Contains(out, "ERROR") || !strings.Contains(out, "boom") {
		t.Errorf("error not logged with cause: %q", out)
	}
}

func TestStdLogSilent(t *testing.T) {
	var buf bytes.Buffer
	l := &stdLog{level: levelSilent, w: &buf}
	l.Info("a", "b")
	l.Debug("a", "b")
	l.Error("a", errors.New("x"), "b")
	if buf.Len() != 0 {
		t.Fatalf("silent log produced output: %q", buf.String())
	}
}

func TestNewLogConstructs(t *testing.T) {
	if NewLog("debug") == nil {
		t.Fatal("NewLog returned nil")
	}
}

func TestNopLog(t *testing.T) {
	var l Log = NopLog{} // discards everything, must not panic
	l.Info("a", "b")
	l.Debug("a", "b")
	l.Error("a", errors.New("x"), "b")
}
