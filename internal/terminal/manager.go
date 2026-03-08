package terminal

import (
	"fmt"
	"io"
	"os"
	"runtime"
	"sync"

	"sit/internal/applog"

	gopty "github.com/aymanbagabas/go-pty"
)

// Manager manages a PTY session connected to a shell process.
type Manager struct {
	pty      gopty.Pty
	mu       sync.Mutex
	closed   bool
	onOutput func(data string)
	onExit   func(exitCode int)
	exitOnce sync.Once
}

// NewManager creates a new terminal Manager.
func NewManager() *Manager {
	return &Manager{}
}

// SetOutputHandler sets the callback function that receives PTY output.
func (m *Manager) SetOutputHandler(handler func(data string)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onOutput = handler
}

// SetExitHandler sets the callback function called when the shell process exits.
func (m *Manager) SetExitHandler(handler func(exitCode int)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onExit = handler
}

// defaultShell returns the default shell for the current platform.
func defaultShell() (string, []string) {
	// On Windows, use cmd.exe as the default.
	// PowerShell is available as a profile but not selected by default.
	if runtime.GOOS == "windows" {
		return "cmd.exe", nil
	}
	// Unix: use SHELL env var, fallback to /bin/bash
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/bash"
	}
	return shell, nil
}

// Start starts a shell process attached to a PTY.
// If command is empty, the default shell for the platform is used.
// If env is non-nil, it replaces the default process environment.
func (m *Manager) Start(command string, args []string, env []string, cols, rows int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Close previous PTY if still open
	if m.pty != nil && !m.closed {
		m.pty.Close()
	}

	// Reset exit once for new process
	m.exitOnce = sync.Once{}
	m.closed = false

	if command == "" {
		command, args = defaultShell()
	}

	pty, err := gopty.New()
	if err != nil {
		return fmt.Errorf("failed to create PTY: %w", err)
	}

	if cols > 0 && rows > 0 {
		if err := pty.Resize(cols, rows); err != nil {
			pty.Close()
			return fmt.Errorf("failed to set initial PTY size: %w", err)
		}
	}

	cmdArgs := append([]string{command}, args...)
	cmd := pty.Command(cmdArgs[0], cmdArgs[1:]...)
	if len(env) > 0 {
		cmd.Env = env
	}
	if err := cmd.Start(); err != nil {
		pty.Close()
		return fmt.Errorf("failed to start shell %q: %w", command, err)
	}

	m.pty = pty

	// Start reading output from PTY in a goroutine
	go m.readOutput()

	// Wait for the process to exit and fire the exit handler
	go m.waitForExit(cmd)

	return nil
}

// waitForExit waits for the command to finish and fires the exit callback.
func (m *Manager) waitForExit(cmd *gopty.Cmd) {
	err := cmd.Wait()
	exitCode := 0
	if err != nil {
		if cmd.ProcessState != nil {
			exitCode = cmd.ProcessState.ExitCode()
		} else {
			exitCode = -1
		}
	}

	// Close the PTY now that the process has exited.
	// This causes readOutput's Read() to return an error and exit its loop.
	m.mu.Lock()
	if m.pty != nil && !m.closed {
		m.closed = true
		m.pty.Close()
	}
	m.mu.Unlock()

	m.exitOnce.Do(func() {
		m.mu.Lock()
		handler := m.onExit
		m.mu.Unlock()
		if handler != nil {
			handler(exitCode)
		}
	})
}

// readOutput continuously reads from the PTY and calls the output handler.
func (m *Manager) readOutput() {
	buf := make([]byte, 4096)
	for {
		n, err := m.pty.Read(buf)
		if n > 0 {
			m.mu.Lock()
			handler := m.onOutput
			m.mu.Unlock()
			if handler != nil {
				handler(string(buf[:n]))
			}
		}
		if err != nil {
			// Suppress expected errors when PTY is closed after process exit
			if err != io.EOF {
				m.mu.Lock()
				wasClosed := m.closed
				m.mu.Unlock()
				if !wasClosed {
					applog.Error("PTY read error: %v", err)
				}
			}
			return
		}
	}
}

// Write sends data to the PTY stdin.
func (m *Manager) Write(data string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed || m.pty == nil {
		return fmt.Errorf("PTY is not running")
	}

	_, err := m.pty.Write([]byte(data))
	return err
}

// Resize changes the PTY window size.
func (m *Manager) Resize(cols, rows int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed || m.pty == nil {
		return fmt.Errorf("PTY is not running")
	}

	return m.pty.Resize(cols, rows)
}

// Close terminates the PTY and the shell process.
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.closed || m.pty == nil {
		return nil
	}

	m.closed = true
	return m.pty.Close()
}
