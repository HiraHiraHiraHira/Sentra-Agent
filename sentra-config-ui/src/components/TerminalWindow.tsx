import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import styles from './TerminalWindow.module.css';

interface TerminalWindowProps {
    processId: string;
    theme?: 'light' | 'dark';
    headerText?: string;
}

export const TerminalWindow: React.FC<TerminalWindowProps> = ({ processId, theme, headerText }) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermInstance = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const userScrolledRef = useRef(false);
    const lastScrollPositionRef = useRef(0);

    useEffect(() => {
        if (!terminalRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            theme: theme === 'light' ? {
                background: '#ffffff',
                foreground: '#000000',
                cursor: '#000000',
                selectionBackground: 'rgba(0, 0, 0, 0.3)'
            } : {
                background: '#1e1e1e',
                foreground: '#ffffff',
                cursor: '#ffffff',
                selectionBackground: 'rgba(255, 255, 255, 0.3)'
            },
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            fontSize: 14,
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.loadAddon(new WebLinksAddon((event, uri) => {
            window.open(uri, '_blank');
        }));

        term.open(terminalRef.current);

        try {
            fitAddon.fit();
        } catch (e) {
            console.warn('Initial fit failed', e);
        }

        // Initial fit retry
        setTimeout(() => {
            try {
                fitAddon.fit();
            } catch (e) {
                console.warn('Retry fit failed', e);
            }
        }, 50);

        xtermInstance.current = term;
        fitAddonRef.current = fitAddon;

        // Auto-scroll logic: Monitor scroll position
        const checkScrollPosition = () => {
            if (!term.buffer || !term.buffer.active) return;

            const viewport = term.buffer.active.viewportY;
            const baseY = term.buffer.active.baseY;

            // Calculate if we're at the bottom (within 3 lines of the end)
            const isAtBottom = (baseY - viewport) <= 3;

            // If user scrolled up manually, disable auto-scroll
            if (!isAtBottom && viewport !== lastScrollPositionRef.current) {
                userScrolledRef.current = true;
                setAutoScroll(false);
            }

            // If user scrolled back to bottom, re-enable auto-scroll
            if (isAtBottom && userScrolledRef.current) {
                userScrolledRef.current = false;
                setAutoScroll(true);
            }

            lastScrollPositionRef.current = viewport;
        };

        // Listen to scroll events
        term.onScroll(() => {
            checkScrollPosition();
        });

        // Function to scroll to bottom
        const scrollToBottom = () => {
            if (!term.buffer || !term.buffer.active) return;
            term.scrollToBottom();
        };

        // Auto-scroll after each write (if enabled)
        const originalWrite = term.write.bind(term);
        term.write = (data: string | Uint8Array, callback?: () => void) => {
            originalWrite(data, () => {
                // Auto-scroll to bottom after write if user hasn't scrolled up
                if (autoScroll && !userScrolledRef.current) {
                    requestAnimationFrame(() => {
                        scrollToBottom();
                    });
                }
                callback?.();
            });
        };

        // Handle input
        term.onData((data) => {
            const token = sessionStorage.getItem('sentra_auth_token');
            fetch(`/api/scripts/input/${processId}?token=${token}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data }),
            }).catch(err => {
                console.error('Failed to send input:', err);
            });
        });

        // Enhanced keyboard handling
        term.attachCustomKeyEventHandler((event) => {
            // Handle Ctrl+C for copy (when text is selected)
            if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
                const selection = term.getSelection();
                if (selection) {
                    navigator.clipboard.writeText(selection).catch(err => {
                        console.error('Failed to copy to clipboard:', err);
                    });
                    return false;
                }
                return true;
            }

            // Handle Ctrl+V for paste
            if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        term.paste(text);
                    }
                }).catch(err => {
                    console.error('Failed to paste from clipboard:', err);
                });
                return false;
            }

            // Handle Ctrl+A for select all
            if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
                term.selectAll();
                return false;
            }

            // Handle End key to jump to bottom and re-enable auto-scroll
            if (event.key === 'End') {
                scrollToBottom();
                userScrolledRef.current = false;
                setAutoScroll(true);
                return false;
            }

            return true;
        });

        // Right-click context menu for copy/paste
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent desktop context menu
            const selection = term.getSelection();

            if (selection) {
                navigator.clipboard.writeText(selection).catch(err => {
                    console.error('Failed to copy:', err);
                });
            } else {
                navigator.clipboard.readText().then(text => {
                    if (text) {
                        term.paste(text);
                    }
                }).catch(err => {
                    console.error('Failed to paste:', err);
                });
            }
        };

        terminalRef.current.addEventListener('contextmenu', handleContextMenu);

        // Handle resize
        const handleResize = () => {
            try {
                fitAddon.fit();
            } catch (e) {
                // Ignore resize errors if terminal is hidden
            }
        };
        window.addEventListener('resize', handleResize);

        // Connect to SSE
        const token = sessionStorage.getItem('sentra_auth_token');
        const eventSource = new EventSource(`/api/scripts/stream/${processId}?token=${token}`);
        eventSourceRef.current = eventSource;

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'output') {
                    term.write(data.data);
                } else if (data.type === 'exit') {
                    term.write(`\r\n\x1b[32m✓ Process exited with code ${data.code}\x1b[0m\r\n`);
                    eventSource.close();
                }
            } catch (e) {
                console.error('Failed to parse SSE message:', e);
            }
        };

        eventSource.onerror = () => {
            term.write('\r\n\x1b[31m✗ Connection lost.\x1b[0m\r\n');
            eventSource.close();
        };

        // Delayed fit and initial scroll to bottom
        setTimeout(() => {
            try {
                fitAddon.fit();
                scrollToBottom();
            } catch (e) { }
        }, 200);

        return () => {
            window.removeEventListener('resize', handleResize);
            terminalRef.current?.removeEventListener('contextmenu', handleContextMenu);
            term.dispose();
            eventSource.close();
        };
    }, [processId, autoScroll, theme]); // Added theme to dependency array to re-init on theme change

    // Re-fit observer with debouncing
    useEffect(() => {
        if (!terminalRef.current) return;

        let timeoutId: NodeJS.Timeout;
        const ro = new ResizeObserver(() => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                try {
                    fitAddonRef.current?.fit();
                } catch (e) { }
            }, 50);
        });

        ro.observe(terminalRef.current);

        return () => {
            clearTimeout(timeoutId);
            ro.disconnect();
        };
    }, []);

    return (
        <div className={styles.terminalContainer}>
            <div
                ref={terminalRef}
                className={styles.terminalWrapper}
                style={{ width: '100%', height: '100%' }}
            />
            {!autoScroll && (
                <div
                    className={styles.scrollHint}
                    onClick={() => {
                        xtermInstance.current?.scrollToBottom();
                        userScrolledRef.current = false;
                        setAutoScroll(true);
                    }}
                >
                    ↓ 跳转到底部
                </div>
            )}
        </div>
    );
};