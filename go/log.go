/* Copyright © 2021-2026 Voxgig Ltd, MIT License. */

package model

import (
	"fmt"
	"io"
	"os"
	"strings"
)

// Log is a minimal leveled logger. Each entry carries a short point (event
// name) and a human-readable note. It stands in for the pino logger used by
// the TypeScript implementation.
type Log interface {
	Info(point, note string)
	Debug(point, note string)
	Error(point string, err error, note string)
}

const (
	levelDebug = iota
	levelInfo
	levelError
	levelSilent
)

// NewLog returns a Log writing to stderr at the given level: "debug",
// "info" (the default), "error", or "silent".
func NewLog(level string) Log {
	return &stdLog{level: parseLevel(level), w: os.Stderr}
}

func parseLevel(level string) int {
	switch strings.ToLower(level) {
	case "debug", "trace":
		return levelDebug
	case "warn", "error", "fatal":
		return levelError
	case "silent":
		return levelSilent
	default:
		return levelInfo
	}
}

type stdLog struct {
	level int
	w     io.Writer
}

func (l *stdLog) Info(point, note string)  { l.emit(levelInfo, "INFO", point, note) }
func (l *stdLog) Debug(point, note string) { l.emit(levelDebug, "DEBUG", point, note) }

func (l *stdLog) Error(point string, err error, note string) {
	if err != nil {
		note = strings.TrimSpace(note + " " + err.Error())
	}
	l.emit(levelError, "ERROR", point, note)
}

func (l *stdLog) emit(level int, label, point, note string) {
	if level < l.level {
		return
	}
	fmt.Fprintf(l.w, "%-5s %-18s %s\n", label, point, note)
}

// NopLog discards all log entries.
type NopLog struct{}

// Info discards the entry.
func (NopLog) Info(string, string) {}

// Debug discards the entry.
func (NopLog) Debug(string, string) {}

// Error discards the entry.
func (NopLog) Error(string, error, string) {}
