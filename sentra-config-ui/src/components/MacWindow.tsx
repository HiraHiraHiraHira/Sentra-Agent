import React, { useState, useRef, useEffect } from 'react';
import Draggable from 'react-draggable';
import { motion } from 'framer-motion';
import { IoCloseOutline, IoRemoveOutline, IoSquareOutline, IoCopyOutline } from 'react-icons/io5';
import styles from './MacWindow.module.css';

interface MacWindowProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  initialPos?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  zIndex: number;
  isActive: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  children: React.ReactNode;
}

export const MacWindow: React.FC<MacWindowProps> = ({
  id,
  title,
  icon,
  initialPos,
  initialSize = { width: 800, height: 500 },
  zIndex,
  isActive,
  isMinimized,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onMove,
  children
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [size, setSize] = useState(initialSize);
  const nodeRef = useRef<HTMLDivElement>(null);
  
  // Initialize position from props or calculate center immediately to avoid flash/wrong position
  const [defaultPos] = useState(() => {
    if (initialPos) return initialPos;
    const width = initialSize?.width || 800;
    const height = initialSize?.height || 500;
    return {
      x: Math.max(0, (window.innerWidth - width) / 2),
      y: Math.max(40, (window.innerHeight - height) / 2)
    };
  });

  useEffect(() => {
    // If no initial position was provided, sync the calculated default position to parent
    if (!initialPos) {
      onMove(defaultPos.x, defaultPos.y);
    }
  }, []);

  const handleMaximizeToggle = () => {
    setIsMaximized(!isMaximized);
    // Don't call onMaximize prop as it might be for something else, we handle state locally
  };

  // Animation variants
  const variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const windowContent = (
    <motion.div
      ref={nodeRef}
      className={`${styles.window} ${isActive ? styles.active : ''}`}
      style={{
        width: isMaximized ? '100vw' : size.width,
        height: isMaximized ? 'calc(100vh - 30px)' : size.height,
        zIndex,
        position: isMaximized ? 'fixed' : 'absolute',
        top: isMaximized ? 30 : 0,
        left: isMaximized ? 0 : 0,
        borderRadius: isMaximized ? 0 : 8,
        resize: isMaximized ? 'none' : 'both',
      }}
      onMouseDown={onFocus}
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={variants}
      transition={{ duration: 0.2 }}
    >
      <div className={`${styles.titleBar} window-drag-handle`} onDoubleClick={handleMaximizeToggle}>
        <div className={styles.title}>
          {icon && <span className={styles.titleIcon}>{icon}</span>}
          {title}
        </div>
        <div className={`${styles.controls} window-controls`}>
          <button className={`${styles.btn} ${styles.minimize}`} onClick={(e) => { e.stopPropagation(); onMinimize(); }}>
            <IoRemoveOutline />
          </button>
          <button className={`${styles.btn} ${styles.maximize}`} onClick={(e) => { e.stopPropagation(); handleMaximizeToggle(); }}>
            {isMaximized ? <IoCopyOutline size={12} /> : <IoSquareOutline size={12} />}
          </button>
          <button className={`${styles.btn} ${styles.close}`} onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <IoCloseOutline size={18} />
          </button>
        </div>
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </motion.div>
  );

  if (isMinimized) return null;

  if (isMaximized) {
    return windowContent;
  }

  return (
    <Draggable
      handle=".window-drag-handle"
      defaultPosition={defaultPos}
      onStart={onFocus}
      onStop={(_e, data) => onMove(data.x, data.y)}
      nodeRef={nodeRef}
      bounds="parent" // Prevent dragging off screen completely
    >
      {windowContent}
    </Draggable>
  );
};