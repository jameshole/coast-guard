import {
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Image,
  FileCode2,
  FileCheck,
  Braces,
  Hash,
  type LucideIcon,
} from 'lucide-react';

const extensionMap: Record<string, LucideIcon> = {
  // JavaScript/TypeScript
  '.js': FileCode,
  '.jsx': FileCode,
  '.ts': FileCode,
  '.tsx': FileCode,
  '.mjs': FileCode,
  '.cjs': FileCode,

  // Web
  '.html': FileCode2,
  '.htm': FileCode2,
  '.css': FileCode2,
  '.scss': FileCode2,
  '.sass': FileCode2,
  '.less': FileCode2,

  // Data
  '.json': FileJson,
  '.yaml': FileJson,
  '.yml': FileJson,
  '.toml': FileJson,
  '.xml': FileJson,

  // Markdown/Text
  '.md': FileText,
  '.mdx': FileText,
  '.txt': FileText,
  '.rst': FileText,

  // Config
  '.env': FileCheck,
  '.gitignore': FileCheck,
  '.npmrc': FileCheck,
  '.editorconfig': FileCheck,

  // Images
  '.png': Image,
  '.jpg': Image,
  '.jpeg': Image,
  '.gif': Image,
  '.svg': Image,
  '.webp': Image,
  '.ico': Image,

  // Programming languages
  '.py': FileCode,
  '.rb': FileCode,
  '.go': FileCode,
  '.rs': FileCode,
  '.java': FileCode,
  '.kt': FileCode,
  '.swift': FileCode,
  '.c': FileCode,
  '.cpp': FileCode,
  '.h': FileCode,
  '.hpp': FileCode,
  '.cs': FileCode,
  '.php': FileCode,
  '.sh': Hash,
  '.bash': Hash,
  '.zsh': Hash,

  // Type definitions
  '.d.ts': Braces,
};

const filenameMap: Record<string, LucideIcon> = {
  'package.json': FileJson,
  'tsconfig.json': Braces,
  'vite.config.ts': FileCode,
  'webpack.config.js': FileCode,
  'dockerfile': FileCheck,
  'docker-compose.yml': FileCheck,
  '.gitignore': FileCheck,
  '.eslintrc': FileCheck,
  '.prettierrc': FileCheck,
  'readme.md': FileText,
  'license': FileText,
  'license.md': FileText,
};

export function getFileIcon(filename: string, isDirectory: boolean, isOpen: boolean = false): LucideIcon {
  if (isDirectory) {
    return isOpen ? FolderOpen : Folder;
  }

  const lowerName = filename.toLowerCase();

  // Check exact filename match first
  if (filenameMap[lowerName]) {
    return filenameMap[lowerName];
  }

  // Check extension
  const ext = '.' + lowerName.split('.').pop();
  if (extensionMap[ext]) {
    return extensionMap[ext];
  }

  // Handle special cases like .d.ts
  if (lowerName.endsWith('.d.ts')) {
    return Braces;
  }

  return File;
}

export function getFileIconColor(filename: string, isDirectory: boolean): string {
  if (isDirectory) {
    return '#dcb67a'; // Folder color
  }

  const lowerName = filename.toLowerCase();
  const ext = '.' + lowerName.split('.').pop();

  // Color mapping
  const colorMap: Record<string, string> = {
    '.ts': '#3178c6',
    '.tsx': '#3178c6',
    '.js': '#f7df1e',
    '.jsx': '#f7df1e',
    '.json': '#cbcb41',
    '.md': '#519aba',
    '.css': '#563d7c',
    '.scss': '#c6538c',
    '.html': '#e34c26',
    '.py': '#3572a5',
    '.go': '#00add8',
    '.rs': '#dea584',
    '.rb': '#cc342d',
  };

  return colorMap[ext] || '#808080';
}
