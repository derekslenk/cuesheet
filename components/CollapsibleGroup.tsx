'use client';

import { useState, ReactNode } from 'react';

interface CollapsibleGroupProps {
  title: string;
  itemCount: number;
  children: ReactNode;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
}

export default function CollapsibleGroup({ 
  title, 
  itemCount, 
  children, 
  defaultOpen = true,
  isOpen: controlledIsOpen,
  onToggle
}: CollapsibleGroupProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  
  // Use controlled state if provided, otherwise use internal state
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  return (
    <div className="collapsible-group">
      <button
        className="collapsible-header"
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        <div className="collapsible-header-content">
          <svg
            className={`collapsible-icon ${isOpen ? 'open' : ''}`}
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <h3 className="collapsible-title">{title}</h3>
          <span className="collapsible-count">{itemCount}</span>
        </div>
      </button>
      
      <div className={`collapsible-content ${isOpen ? 'open' : ''}`}>
        <div className="collapsible-content-inner">
          {children}
        </div>
      </div>
    </div>
  );
}