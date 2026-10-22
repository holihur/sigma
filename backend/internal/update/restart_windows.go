//go:build windows

package update

import "errors"

func Restart() error {
	return errors.New("automatic restart is not supported on Windows; restart Sigma manually")
}
