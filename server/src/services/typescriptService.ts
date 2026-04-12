import ts from 'typescript';
import fs from 'fs';
import path from 'path';
import type { DefinitionResult } from '../types/index.js';

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export class TypeScriptService {
  private projectPath: string;
  private languageService: ts.LanguageService | null = null;
  private fileVersions: Map<string, string> = new Map();
  private fileList: string[] | null = null;
  private compilerOptions: ts.CompilerOptions;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
    this.compilerOptions = this.loadCompilerOptions();
  }

  private loadCompilerOptions(): ts.CompilerOptions {
    const tsconfigPath = ts.findConfigFile(this.projectPath, ts.sys.fileExists, 'tsconfig.json');
    if (tsconfigPath) {
      const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      if (!configFile.error) {
        const parsed = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          path.dirname(tsconfigPath),
        );
        return parsed.options;
      }
    }

    // Sensible defaults for a code browser
    return {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      skipLibCheck: true,
      noEmit: true,
    };
  }

  private discoverFiles(): string[] {
    if (this.fileList) return this.fileList;

    const files: string[] = [];
    const ignored = new Set([
      'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
      '__pycache__', 'coverage', '.nyc_output',
    ]);

    const scan = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scan(fullPath);
          } else if (entry.isFile() && TS_EXTENSIONS.has(path.extname(entry.name))) {
            files.push(fullPath);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    scan(this.projectPath);
    this.fileList = files;
    return files;
  }

  private getFileVersion(fileName: string): string {
    try {
      const stat = fs.statSync(fileName);
      return stat.mtimeMs.toString();
    } catch {
      return '0';
    }
  }

  private getService(): ts.LanguageService {
    if (this.languageService) return this.languageService;

    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => this.compilerOptions,
      getScriptFileNames: () => this.discoverFiles(),
      getScriptVersion: (fileName) => {
        const cached = this.fileVersions.get(fileName);
        const current = this.getFileVersion(fileName);
        if (cached !== current) {
          this.fileVersions.set(fileName, current);
        }
        return current;
      },
      getScriptSnapshot: (fileName) => {
        try {
          const content = fs.readFileSync(fileName, 'utf-8');
          return ts.ScriptSnapshot.fromString(content);
        } catch {
          return undefined;
        }
      },
      getCurrentDirectory: () => this.projectPath,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      readFile: (filePath) => {
        try {
          return fs.readFileSync(filePath, 'utf-8');
        } catch {
          return undefined;
        }
      },
      fileExists: (filePath) => fs.existsSync(filePath),
      useCaseSensitiveFileNames: () => !process.platform.startsWith('win'),
      getDirectories: (dirPath) => {
        try {
          return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
        } catch {
          return [];
        }
      },
      directoryExists: (dirPath) => {
        try {
          return fs.statSync(dirPath).isDirectory();
        } catch {
          return false;
        }
      },
      readDirectory: ts.sys.readDirectory,
      realpath: ts.sys.realpath,
    };

    this.languageService = ts.createLanguageService(host, ts.createDocumentRegistry());
    return this.languageService;
  }

  getDefinition(relativeFilePath: string, offset: number): DefinitionResult[] {
    const absolutePath = path.resolve(this.projectPath, relativeFilePath);

    // Check this is a TS/JS file
    const ext = path.extname(absolutePath);
    if (!TS_EXTENSIONS.has(ext)) {
      return [];
    }

    const service = this.getService();

    try {
      const definitions = service.getDefinitionAtPosition(absolutePath, offset);
      if (!definitions || definitions.length === 0) return [];

      const results: DefinitionResult[] = [];

      for (const def of definitions) {
        // Skip definitions in node_modules or lib files
        if (def.fileName.includes('node_modules') ||
            def.fileName.includes('/lib.') ||
            def.fileName.includes('/lib/lib.')) {
          continue;
        }

        // Skip self-references (clicking on a definition that points to itself)
        if (def.fileName === absolutePath &&
            offset >= def.textSpan.start &&
            offset < def.textSpan.start + def.textSpan.length) {
          continue;
        }

        // Convert absolute path back to relative
        const relativePath = path.relative(this.projectPath, def.fileName);
        // Skip if outside project
        if (relativePath.startsWith('..')) continue;

        // Get line/column from offset
        const content = fs.readFileSync(def.fileName, 'utf-8');
        const beforeDef = content.substring(0, def.textSpan.start);
        const line = (beforeDef.match(/\n/g) || []).length + 1;
        const lastNewline = beforeDef.lastIndexOf('\n');
        const column = def.textSpan.start - (lastNewline + 1);

        // Get the context line
        const lines = content.split('\n');
        const contextLine = lines[line - 1] || '';

        results.push({
          filePath: relativePath,
          line,
          column,
          context: contextLine.trim(),
        });
      }

      return results;
    } catch (err) {
      console.error('TypeScript definition lookup failed:', err);
      return [];
    }
  }

  invalidate(): void {
    this.fileList = null;
  }
}
