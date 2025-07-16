'use client';

import { useRef, useEffect, useState } from 'react';

type DropdownProps = {
  options: Array<{ id: number; name: string }>;
  activeId: number | null;
  onSelect: (id: number) => void;
  label: string;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
};

export default function Dropdown({
  options,
  activeId,
  onSelect,
  label,
  isOpen: controlledIsOpen,
  onToggle,
}: DropdownProps) {
const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(controlledIsOpen ?? false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (!dropdownRef.current || !(event.target instanceof Node)) return;
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        if (onToggle) onToggle(false);
        else setIsOpen(false);
      }
    };

    if (controlledIsOpen || isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [controlledIsOpen, isOpen, onToggle]);

  const activeOption = options.find((option) => option.id === activeId) || null;

  const handleSelect = (option: { id: number }) => {
    onSelect(option.id);
    if (onToggle) onToggle(false);
    else setIsOpen(false);
  };

  const toggleDropdown = () => {
    if (onToggle) onToggle(!isOpen);
    else setIsOpen((prev) => !prev);
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleDropdown}
        className="inline-flex justify-between items-center w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {activeOption ? activeOption.name : label}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="ml-2 h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a 1 1 0 01-1.414 0l-4-4a 1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {(controlledIsOpen ?? isOpen) && (
        <div
          className="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none"
          style={{ zIndex: 50 }} // Set a high z-index value
        >
          <div className="py-1">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option)}
                className={`block w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 ${
                  activeOption?.id === option.id ? 'font-bold text-blue-500' : ''
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
