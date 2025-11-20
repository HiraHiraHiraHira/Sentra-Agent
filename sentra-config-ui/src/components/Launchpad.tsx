import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getIconForType, getDisplayName } from '../utils/icons';
import styles from './Launchpad.module.css';
import { IoChevronBack, IoChevronForward } from 'react-icons/io5';

interface LaunchpadProps {
  isOpen: boolean;
  onClose: () => void;
  items: { name: string; type: 'module' | 'plugin'; onClick: () => void }[];
}

export const Launchpad: React.FC<LaunchpadProps> = ({ isOpen, onClose, items }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const displayName = getDisplayName(item.name);
      return displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [items, searchTerm]);

  // Categorize items for pagination
  const pages = useMemo(() => {
    if (searchTerm) return [filteredItems]; // Show all results in one page when searching

    const coreApps: typeof items = [];
    const toolsApps: typeof items = [];
    const qqApps: typeof items = [];

    filteredItems.forEach(item => {
      const name = item.name.toLowerCase();
      if (
        name.includes('sentra-prompts') ||
        name.includes('sentra-mcp') ||
        name.includes('sentra-emo') ||
        name.includes('sentra-adapter') ||
        name.includes('sentra-rag')
      ) {
        coreApps.push(item);
      } else if (name.includes('qq_') || name.includes('qq-')) {
        qqApps.push(item);
      } else {
        toolsApps.push(item);
      }
    });

    // Page 1: Core Apps + Some Tools if space permits (but user asked for specific pages)
    // User request: 
    // Page 1: Prompts, MCP, Emo (Core)
    // Page 2: Other Tools
    // Page 3: QQ Plugins

    // Let's strictly follow the requested order if possible, but handle empty categories
    const result = [];
    if (coreApps.length > 0) result.push(coreApps);
    if (toolsApps.length > 0) result.push(toolsApps);
    if (qqApps.length > 0) result.push(qqApps);

    return result.length > 0 ? result : [[]];
  }, [filteredItems, searchTerm]);

  const totalPages = pages.length;
  const activePage = Math.min(currentPage, totalPages - 1);

  const handlePageChange = (direction: 'prev' | 'next') => {
    if (direction === 'prev') {
      setCurrentPage(p => Math.max(0, p - 1));
    } else {
      setCurrentPage(p => Math.min(totalPages - 1, p + 1));
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <div className={styles.content} onClick={onClose}>
            <div className={styles.searchBar} onClick={e => e.stopPropagation()}>
              <span className="material-icons" style={{ color: '#fff', opacity: 0.6 }}>search</span>
              <input
                type="text"
                placeholder="搜索"
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(0);
                }}
                autoFocus
              />
            </div>

            <div className={styles.pagesContainer} onClick={onClose}>
              <AnimatePresence mode='wait'>
                <motion.div
                  key={activePage}
                  className={styles.grid}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.2 }}
                  onClick={onClose}
                >
                  {pages[activePage]?.map((item, index) => (
                    <motion.div
                      key={`${item.type}-${item.name}`}
                      className={styles.appItem}
                      onClick={(e) => {
                        e.stopPropagation();
                        item.onClick();
                        onClose();
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className={styles.iconWrapper}>
                        {getIconForType(item.name, item.type)}
                      </div>
                      <div className={styles.appName}>{getDisplayName(item.name)}</div>
                    </motion.div>
                  ))}
                </motion.div>
              </AnimatePresence>
            </div>

            {totalPages > 1 && (
              <div className={styles.pagination} onClick={e => e.stopPropagation()}>
                <button
                  className={styles.navBtn}
                  onClick={() => handlePageChange('prev')}
                  disabled={activePage === 0}
                >
                  <IoChevronBack />
                </button>

                <div className={styles.dots}>
                  {pages.map((_, idx) => (
                    <div
                      key={idx}
                      className={`${styles.dot} ${idx === activePage ? styles.activeDot : ''}`}
                      onClick={() => setCurrentPage(idx)}
                    />
                  ))}
                </div>

                <button
                  className={styles.navBtn}
                  onClick={() => handlePageChange('next')}
                  disabled={activePage === totalPages - 1}
                >
                  <IoChevronForward />
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};