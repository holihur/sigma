//go:build !windows

package update

import (
	"os"
	"syscall"
)

// Restart replaces the current process with the freshly installed binary.
// The caller should only invoke this after the HTTP response has been written.
func Restart() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	argv := append([]string{exe}, os.Args[1:]...)
	return syscall.Exec(exe, argv, os.Environ())
}
