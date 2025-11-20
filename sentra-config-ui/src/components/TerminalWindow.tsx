import React, { useState, useEffect, useRef } from 'react';
import styles from './TerminalWindow.module.css';
import Convert from 'ansi-to-html';

interface TerminalWindowProps {
    processId: string;
}

const convert = new Convert({
    fg: '#FFF',
    bg: '#000',
    newline: true,
    escapeXML: true,
});

export const TerminalWindow: React.FC<TerminalWindowProps> = ({
    processId,
}) => {
    const [lines, setLines] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);

    useEffect(() => {
        const eventSource = new EventSource(`http://localhost:7245/api/scripts/stream/${processId}`);

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'output') {
                const text = data.data;
                // Handle carriage returns for spinners
                if (text.startsWith('\r')) {
                    const html = convert.toHtml(text.substring(1));
                    setLines(prev => {
                        if (prev.length === 0) return [html];
                        const newLines = [...prev];
                        newLines[newLines.length - 1] = html;
                        return newLines;
                    });
                } else {
                    // Split by newline to ensure we render distinct lines
                    // This helps with performance and structure
                    const parts = text.split('\n');
                    const newHtmlLines = parts.map((part: string) => convert.toHtml(part));

                    setLines(prev => {
                        // If the last chunk didn't end with newline, merge? 
                        // For simplicity and robustness, we just append.
                        // A more complex terminal emulator would handle cursor position, 
                        // but for a log viewer, appending is usually fine.
                        return [...prev, ...newHtmlLines];
                    });
                }
            } else if (data.type === 'exit') {
                setIsRunning(false);
                const exitMsg = convert.toHtml(`\n\x1b[32m✓ Process exited with code ${data.code ?? 'unknown'}\x1b[0m\n`);
                setLines(prev => [...prev, exitMsg]);
                eventSource.close();
            }
        };

        eventSource.onerror = () => {
            setIsRunning(false);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [processId]);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            requestAnimationFrame(() => {
                if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                }
            });
        }
    }, [lines, autoScroll]);

    // Debug logging
    useEffect(() => {
        console.log('Terminal lines updated:', lines.length);
    }, [lines]);

    const handleScroll = () => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 20;
            setAutoScroll(isAtBottom);
        }
    };

    return (
        <div className={styles.terminalContainer} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                padding: '4px 8px',
                background: '#333',
                color: '#aaa',
                fontSize: '10px',
                borderBottom: '1px solid #444',
                display: 'flex',
                justifyContent: 'space-between'
            }}>
                <span>Process ID: {processId}</span>
                <span>Lines: {lines.length} {isRunning ? '(Running)' : '(Exited)'}</span>
            </div>
            <div
                className={styles.terminal}
                ref={scrollRef}
                onScroll={handleScroll}
                style={{ flex: 1, overflowY: 'auto' }}
            >
                <div className={styles.output}>
                    {lines.length === 0 && <div style={{ color: '#666', padding: '20px', textAlign: 'center' }}>Waiting for output...</div>}
                    {lines.map((line, index) => (
                        <div key={index} dangerouslySetInnerHTML={{ __html: line || '&nbsp;' }} style={{ minHeight: '1.4em' }} />
                    ))}
                </div>
            </div>
        </div>
    );
};
