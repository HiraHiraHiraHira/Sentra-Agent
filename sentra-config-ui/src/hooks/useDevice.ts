import { useState, useEffect } from 'react';

export const useDevice = () => {
    const [width, setWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    let uaMobile = false;
    try {
        const ua = String(navigator.userAgent || '').toLowerCase();
        uaMobile = /iphone|ipad|ipod|android|mobile|tablet/.test(ua);
    } catch {
        uaMobile = false;
    }

    if (!uaMobile) {
        return { isMobile: false, isTablet: false, isDesktop: true };
    }

    const isMobile = width < 768;
    const isTablet = width >= 768 && width < 1024;
    const isDesktop = width >= 1024;

    return { isMobile, isTablet, isDesktop };
};
