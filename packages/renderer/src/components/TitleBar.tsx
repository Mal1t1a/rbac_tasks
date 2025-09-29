import React, { useState, useEffect } from 'react';
import { VscChromeMaximize, VscChromeRestore, VscChromeClose, VscChromeMinimize } from 'react-icons/vsc';
import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../context/ThemeContext';

interface TitleBarProps {
  title?: string;
}

export function TitleBar({ title = 'Task Management' }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    // Check initial maximized state
    const checkMaximized = async () => {
      if (window.api?.windowIsMaximized) {
        const maximized = await window.api.windowIsMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();

    // Listen for window state changes
    if (window.api?.onWindowStateChanged) {
      const unsubscribe = window.api.onWindowStateChanged((state) => {
        setIsMaximized(state.isMaximized);
      });

      return unsubscribe;
    }
  }, []);

  const handleMinimize = async () => {
    if (window.api?.windowMinimize) {
      await window.api.windowMinimize();
    }
  };

  const handleMaximizeRestore = async () => {
    if (window.api?.windowMaximize) {
      await window.api.windowMaximize();
      // State will be updated automatically via the window state change event
    }
  };

  const handleClose = async () => {
    if (window.api?.windowClose) {
      await window.api.windowClose();
    }
  };

  return (
  <div className="flex items-center justify-between h-8 bg-app border-b border-subtle select-none">
      {/* Draggable area */}
      <div 
        className="flex-1 h-full flex items-center px-4 cursor-move"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
  <span className="text-sm text-fg-muted font-medium">{title}</span>
      </div>

      {/* Window controls */}
      <div 
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="titlebar-btn titlebar-btn--neutral group px-3 h-full flex items-center justify-center text-fg-subtle hover:text-fg hover-bg-pill transition-colors duration-150 active:opacity-90"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <FiMoon className="titlebar-icon w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" /> : <FiSun className="titlebar-icon w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />}
        </button>
        {/* Minimize button */}
        <button
          onClick={handleMinimize}
          className="titlebar-btn titlebar-btn--neutral group w-12 h-full flex items-center justify-center text-fg-subtle hover:text-fg hover-bg-pill transition-colors duration-150 active:opacity-90"
          title="Minimize"
        >
          <VscChromeMinimize className="titlebar-icon w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* Maximize/Restore button */}
        <button
          onClick={handleMaximizeRestore}
          className="titlebar-btn titlebar-btn--neutral group w-12 h-full flex items-center justify-center text-fg-subtle hover:text-fg hover-bg-pill transition-colors duration-150 active:opacity-90"
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? <VscChromeRestore className="titlebar-icon w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" /> : <VscChromeMaximize className="titlebar-icon w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />}
        </button>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="titlebar-btn group w-12 h-full flex items-center justify-center text-fg-subtle hover:bg-[var(--app-danger)] hover:text-white transition-colors duration-150 active:opacity-90"
          title="Close"
        >
          <VscChromeClose className="titlebar-icon w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    </div>
  );
}
