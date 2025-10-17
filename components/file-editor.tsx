'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useTheme } from 'next-themes'

// Monaco types for editor and monaco instances
type MonacoEditor = Parameters<OnMount>[0]
type Monaco = Parameters<OnMount>[1]

interface FileEditorProps {
  filename: string
  initialContent: string
  language: string
  taskId: string
  viewMode?: 'local' | 'remote' | 'all' | 'all-local'
  onUnsavedChanges?: (hasChanges: boolean) => void
  onSavingStateChange?: (isSaving: boolean) => void
  onOpenFile?: (filename: string, lineNumber?: number) => void
  onSaveSuccess?: () => void
}

// Helper function to map file extensions to Monaco language IDs
function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    md: 'markdown',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'shell',
    sql: 'sql',
    yml: 'yaml',
    yaml: 'yaml',
  }
  return map[ext || ''] || 'plaintext'
}

export function FileEditor({
  filename,
  initialContent,
  language,
  taskId,
  viewMode = 'local',
  onUnsavedChanges,
  onSavingStateChange,
  onOpenFile,
  onSaveSuccess,
}: FileEditorProps) {
  const { theme, systemTheme } = useTheme()
  const currentTheme = theme === 'system' ? systemTheme : theme
  const [content, setContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false)
  const [savedContent, setSavedContent] = useState(initialContent)
  const [fontSize, setFontSize] = useState(16) // Default to 16px for mobile
  const editorRef = useRef<MonacoEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const onUnsavedChangesRef = useRef(onUnsavedChanges)
  const onSavingStateChangeRef = useRef(onSavingStateChange)
  const onOpenFileRef = useRef(onOpenFile)
  const onSaveSuccessRef = useRef(onSaveSuccess)
  const handleSaveRef = useRef<(() => Promise<void>) | null>(null)

  // Set responsive font size based on screen width
  useEffect(() => {
    const updateFontSize = () => {
      // Use 16px on mobile (< 768px) to prevent zoom, 13px on desktop
      setFontSize(window.innerWidth < 768 ? 16 : 13)
    }

    // Set initial font size
    updateFontSize()

    // Update on resize
    window.addEventListener('resize', updateFontSize)
    return () => window.removeEventListener('resize', updateFontSize)
  }, [])

  // Keep refs updated
  useEffect(() => {
    onUnsavedChangesRef.current = onUnsavedChanges
  }, [onUnsavedChanges])

  useEffect(() => {
    onSavingStateChangeRef.current = onSavingStateChange
  }, [onSavingStateChange])

  useEffect(() => {
    onOpenFileRef.current = onOpenFile
  }, [onOpenFile])

  useEffect(() => {
    onSaveSuccessRef.current = onSaveSuccess
  }, [onSaveSuccess])

  useEffect(() => {
    setContent(initialContent)
    setSavedContent(initialContent)
  }, [filename, initialContent])

  useEffect(() => {
    // Don't track unsaved changes for node_modules files (they're read-only)
    const isNodeModules = filename.includes('/node_modules/')
    if (!isNodeModules) {
      const hasChanges = content !== savedContent
      console.log('[Unsaved Changes] Tracked:', {
        hasChanges,
        contentLength: content.length,
        savedContentLength: savedContent.length,
        filename,
        hasCallback: !!onUnsavedChangesRef.current,
      })
      if (onUnsavedChangesRef.current) {
        console.log('[Unsaved Changes] Calling callback with hasChanges:', hasChanges)
        onUnsavedChangesRef.current(hasChanges)
      } else {
        console.log('[Unsaved Changes] No callback available!')
      }
    }
  }, [content, savedContent, filename])

  const handleContentChange = (newContent: string | undefined) => {
    if (newContent !== undefined) {
      console.log('[Content Change] Content changed, length:', newContent.length)
      setContent(newContent)
    }
  }

  const handleSave = useCallback(async () => {
    console.log('[Save] handleSave called')
    const currentContent = editorRef.current?.getValue()
    console.log('[Save] Current state:', {
      hasContent: !!currentContent,
      isSaving,
      hasChanges: currentContent !== savedContent,
      filename,
    })

    if (!currentContent || isSaving || currentContent === savedContent) {
      console.log('[Save] Skipping save:', {
        noContent: !currentContent,
        isSaving,
        noChanges: currentContent === savedContent,
      })
      return
    }

    setIsSaving(true)
    console.log('[Save] Setting isSaving to true, calling callback:', !!onSavingStateChangeRef.current)
    if (onSavingStateChangeRef.current) {
      onSavingStateChangeRef.current(true)
    }
    console.log('[Save] Starting save...')
    try {
      const response = await fetch(`/api/tasks/${taskId}/save-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename,
          content: currentContent,
        }),
      })

      const data = await response.json()
      console.log('[Save] Response:', { ok: response.ok, data })

      if (response.ok && data.success) {
        console.log('[Save] Save successful, updating savedContent')
        setSavedContent(currentContent)
        // Notify parent component of successful save
        if (onSaveSuccessRef.current) {
          onSaveSuccessRef.current()
        }
        // Force a re-check of unsaved changes
        setTimeout(() => {
          const latestContent = editorRef.current?.getValue()
          if (latestContent) {
            console.log('[Save] Post-save check:', {
              savedLength: currentContent.length,
              currentLength: latestContent.length,
              match: latestContent === currentContent,
            })
          }
        }, 100)
      } else {
        toast.error(data.error || 'Failed to save file')
      }
    } catch (error) {
      console.error('Error saving file:', error)
      toast.error('Failed to save file')
    } finally {
      setIsSaving(false)
      console.log('[Save] Setting isSaving to false, calling callback:', !!onSavingStateChangeRef.current)
      if (onSavingStateChangeRef.current) {
        onSavingStateChangeRef.current(false)
      }
    }
  }, [isSaving, savedContent, taskId, filename])

  // Keep handleSave ref updated
  useEffect(() => {
    handleSaveRef.current = handleSave
  }, [handleSave])

  // Note: With the new LSP integration, we no longer need to pre-load project files
  // into Monaco. The TypeScript Language Service runs in the sandbox and has direct
  // access to all files, node_modules/@types, and tsconfig.json. This provides:
  // - Full type resolution for React, Next.js, and all npm packages
  // - Jump to definition in node_modules
  // - Complete IntelliSense without loading hundreds of files into the browser
  const loadProjectFiles = useCallback(async () => {
    console.log('[Load Project Files] Skipping - using sandbox-based LSP instead')
    // The LSP endpoint will handle all type resolution on demand
  }, [])

  // Define themes before mount to prevent light mode flash
  const handleBeforeMount = useCallback((monaco: Monaco) => {
    console.log('[Editor Before Mount] Defining themes...')

    // Define Vercel/Geist dark theme (matching ray-so)
    monaco.editor.defineTheme('vercel-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'ededed' },
        { token: 'comment', foreground: 'a1a1a1' },
        { token: 'keyword', foreground: 'ff6b9d' },
        { token: 'string', foreground: '79f2a8' },
        { token: 'string.escape', foreground: '79f2a8' },
        { token: 'number', foreground: 'ffffff' },
        { token: 'constant', foreground: '9ca7ff' },
        { token: 'constant.numeric', foreground: 'ffffff' },
        { token: 'variable', foreground: 'ededed' },
        { token: 'variable.parameter', foreground: 'ffd494' },
        { token: 'function', foreground: 'ea94ea' },
        { token: 'identifier', foreground: 'ededed' },
        { token: 'type', foreground: '9ca7ff' },
        { token: 'type.identifier', foreground: '9ca7ff' },
        { token: 'class.name', foreground: '9ca7ff' },
        { token: 'delimiter', foreground: 'ededed' },
        { token: 'delimiter.bracket', foreground: 'ededed' },
        { token: 'tag', foreground: 'ff6b9d' },
        { token: 'tag.id', foreground: '9ca7ff' },
        { token: 'tag.class', foreground: '9ca7ff' },
        { token: 'attribute.name', foreground: '9ca7ff' },
        { token: 'attribute.value', foreground: '79f2a8' },
        { token: 'meta.tag', foreground: 'ededed' },
      ],
      colors: {
        'editor.background': '#000000',
        'editor.foreground': '#ededed',
        'editor.lineHighlightBackground': '#1a1a1a',
        'editorLineNumber.foreground': '#6b6b6b',
        'editorLineNumber.activeForeground': '#a1a1a1',
        'editor.selectionBackground': '#3d5a80',
        'editor.inactiveSelectionBackground': '#2d4a60',
        'editorCursor.foreground': '#ededed',
        'editorWhitespace.foreground': '#3a3a3a',
        'editorIndentGuide.background': '#1a1a1a',
        'editorIndentGuide.activeBackground': '#2a2a2a',
        'editorBracketMatch.background': '#1a1a1a',
        'editorBracketMatch.border': '#9ca7ff',
      },
    })

    // Define Vercel/Geist light theme (matching ray-so)
    monaco.editor.defineTheme('vercel-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: '', foreground: '171717' },
        { token: 'comment', foreground: '666666' },
        { token: 'keyword', foreground: 'd63384' },
        { token: 'string', foreground: '028a5a' },
        { token: 'string.escape', foreground: '028a5a' },
        { token: 'number', foreground: '111111' },
        { token: 'constant', foreground: '0550ae' },
        { token: 'constant.numeric', foreground: '111111' },
        { token: 'variable', foreground: '171717' },
        { token: 'variable.parameter', foreground: 'c77700' },
        { token: 'function', foreground: '8250df' },
        { token: 'identifier', foreground: '171717' },
        { token: 'type', foreground: '0550ae' },
        { token: 'type.identifier', foreground: '0550ae' },
        { token: 'class.name', foreground: '0550ae' },
        { token: 'delimiter', foreground: '171717' },
        { token: 'delimiter.bracket', foreground: '171717' },
        { token: 'tag', foreground: 'd63384' },
        { token: 'tag.id', foreground: '0550ae' },
        { token: 'tag.class', foreground: '0550ae' },
        { token: 'attribute.name', foreground: '0550ae' },
        { token: 'attribute.value', foreground: '028a5a' },
        { token: 'meta.tag', foreground: '171717' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#171717',
        'editor.lineHighlightBackground': '#f8f8f8',
        'editorLineNumber.foreground': '#9ca3af',
        'editorLineNumber.activeForeground': '#666666',
        'editor.selectionBackground': '#b3d7ff',
        'editor.inactiveSelectionBackground': '#d3e5f8',
        'editorCursor.foreground': '#171717',
        'editorWhitespace.foreground': '#e5e5e5',
        'editorIndentGuide.background': '#f0f0f0',
        'editorIndentGuide.activeBackground': '#e0e0e0',
        'editorBracketMatch.background': '#f0f0f0',
        'editorBracketMatch.border': '#0550ae',
      },
    })

    console.log('[Editor Before Mount] Themes defined successfully')
  }, [])

  const handleEditorMount: OnMount = (editor, monaco) => {
    console.log('[Editor Mount] Editor mounting for file:', filename)
    editorRef.current = editor
    monacoRef.current = monaco

    // IMPORTANT: Set the model to use a file:// URI so TypeScript service can resolve imports
    const model = editor.getModel()
    if (model) {
      const currentUri = model.uri.toString()
      console.log('[Editor Mount] Current model URI:', currentUri)

      // Normalize filename to always have leading slash
      const normalizedFilename = filename.startsWith('/') ? filename : `/${filename}`
      const expectedUri = `file://${normalizedFilename}`

      // Check if we need to recreate the model with the correct URI
      if (currentUri !== expectedUri) {
        console.log('[Editor Mount] URI mismatch! Expected:', expectedUri, 'Got:', currentUri)

        // Get current content
        const currentContent = model.getValue()

        // Check if a model with the expected URI already exists
        const newUri = monaco.Uri.parse(expectedUri)
        const existingModel = monaco.editor.getModel(newUri)

        if (existingModel) {
          console.log('[Editor Mount] Model with correct URI already exists, reusing it')
          // Dispose the temporary model
          model.dispose()
          // Set the existing model on the editor
          editor.setModel(existingModel)
          // Update content if needed
          if (existingModel.getValue() !== currentContent) {
            existingModel.setValue(currentContent)
          }
        } else {
          console.log('[Editor Mount] Creating new model with correct URI...')
          // Dispose the old model
          model.dispose()

          // Create new model with correct URI
          const language = getLanguageFromPath(normalizedFilename)
          const newModel = monaco.editor.createModel(currentContent, language, newUri)

          // Set the new model on the editor
          editor.setModel(newModel)

          console.log('[Editor Mount] New model created with URI:', newModel.uri.toString())
        }
      } else {
        console.log('[Editor Mount] Model URI is correct')
      }
    }

    // Disable Monaco's built-in TypeScript diagnostics since we're using the sandbox LSP
    // The LSP has full access to node_modules and tsconfig.json, providing accurate type checking
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true, // Disable semantic errors (e.g., "Cannot find module 'react'")
      noSyntaxValidation: false, // Keep syntax validation (e.g., missing semicolons)
      noSuggestionDiagnostics: true, // Disable suggestion diagnostics
    })

    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: true,
    })

    // Still configure compiler options for basic syntax highlighting
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
      typeRoots: ['node_modules/@types'],
    })

    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      reactNamespace: 'React',
      allowJs: true,
    })

    console.log('[Editor Mount] TypeScript diagnostics disabled (using sandbox LSP instead)')

    // Load project files for IntelliSense (currently disabled - using LSP instead)
    loadProjectFiles()

    // Add save command (Cmd/Ctrl + S)
    console.log('[Editor Mount] Adding save command...')
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      console.log('[Save Command] Cmd/Ctrl + S pressed in editor')
      if (handleSaveRef.current) {
        console.log('[Save Command] Calling handleSave from ref')
        handleSaveRef.current()
      } else {
        console.log('[Save Command] handleSaveRef.current is null!')
      }
    })
    console.log('[Editor Mount] Save command added')

    // Helper function to get definitions using remote LSP server in sandbox
    const getDefinitions = async (
      model: ReturnType<MonacoEditor['getModel']>,
      position: ReturnType<MonacoEditor['getPosition']>,
    ) => {
      if (!model || !position) return null
      console.log(
        '[Go to Definition] Starting definition lookup',
        JSON.stringify({
          filename,
          position: { line: position.lineNumber, column: position.column },
          languageId: model.getLanguageId(),
          uri: model.uri.toString(),
        }),
      )

      // Show loading cursor and toast
      if (editorRef.current) {
        const editorDom = editorRef.current.getDomNode()
        if (editorDom) {
          editorDom.style.cursor = 'wait'
        }
      }

      const loadingToast = toast.loading('Finding definition...')

      try {
        // Call the LSP API endpoint
        const response = await fetch(`/api/tasks/${taskId}/lsp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            method: 'textDocument/definition',
            filename,
            position: {
              line: position.lineNumber - 1, // LSP uses 0-indexed lines
              character: position.column - 1, // LSP uses 0-indexed columns
            },
          }),
        })

        console.log('[Go to Definition] LSP API response status:', response.status)

        if (!response.ok) {
          const errorText = await response.text()
          console.error('[Go to Definition] LSP API error:', errorText)
          toast.dismiss(loadingToast)
          toast.error('Failed to find definition')
          return null
        }

        const data = await response.json()
        console.log('[Go to Definition] LSP API response data:', JSON.stringify(data, null, 2))

        if (!data.definitions || data.definitions.length === 0) {
          console.log('[Go to Definition] No definitions found')
          toast.dismiss(loadingToast)
          toast.info('No definition found')
          return null
        }

        // Convert LSP response to Monaco Location format
        interface LspDefinition {
          uri: string
          range: {
            start: { line: number; character: number }
            end: { line: number; character: number }
          }
        }

        const convertedDefinitions = (data.definitions as LspDefinition[]).map((def) => {
          console.log('[Go to Definition] Processing definition:', JSON.stringify(def))

          const result = {
            uri: monaco.Uri.parse(def.uri),
            range: {
              startLineNumber: def.range.start.line + 1, // Monaco uses 1-indexed lines
              startColumn: def.range.start.character + 1, // Monaco uses 1-indexed columns
              endLineNumber: def.range.end.line + 1,
              endColumn: def.range.end.character + 1,
            },
          }
          console.log('[Go to Definition] Converted definition:', JSON.stringify(result))
          return result
        })

        console.log('[Go to Definition] All definitions converted:', JSON.stringify(convertedDefinitions))

        // Dismiss loading toast
        toast.dismiss(loadingToast)

        return convertedDefinitions
      } catch (error) {
        console.error('[Go to Definition] Error getting definitions:', error)

        // Dismiss loading toast and show error
        toast.dismiss(loadingToast)
        toast.error('Failed to find definition')

        return null
      } finally {
        // Reset cursor
        if (editorRef.current) {
          const editorDom = editorRef.current.getDomNode()
          if (editorDom) {
            editorDom.style.cursor = ''
          }
        }
      }
    }

    // Override Go to Definition command to handle cross-file navigation
    console.log('[Editor Mount] Registering Go to Definition action...')
    const actionDisposable = editor.addAction({
      id: 'editor.action.revealDefinition.custom',
      label: 'Go to Definition',
      keybindings: [monaco.KeyCode.F12],
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      run: async (ed) => {
        console.log('[F12] Go to Definition action triggered')
        const model = ed.getModel()
        const position = ed.getPosition()

        if (!model || !position) {
          console.log('[F12] No model or position available')
          return
        }

        console.log('[F12] Calling getDefinitions...')
        const definitions = await getDefinitions(model, position)

        if (!definitions || definitions.length === 0) {
          console.log('[F12] No definitions returned')
          return
        }

        const definition = definitions[0]
        const targetUri = definition.uri.toString()
        const currentUri = model.uri.toString()

        console.log('[F12] Definition found:', {
          targetUri,
          currentUri,
          isSameFile: targetUri === currentUri,
          range: definition.range,
        })

        // Check if the definition is in a different file
        if (targetUri !== currentUri) {
          // Extract the file path from the URI and strip sandbox prefix
          let filePath = targetUri.replace('file://', '')
          // Remove /vercel/sandbox prefix if present (from sandbox LSP)
          filePath = filePath.replace(/^\/vercel\/sandbox/, '')
          console.log('[F12] Opening file in new tab:', filePath)

          // Open in a new tab
          if (onOpenFileRef.current) {
            onOpenFileRef.current(filePath, definition.range.startLineNumber)
          } else {
            console.log('[F12] onOpenFile callback not available')
          }
        } else {
          // Same file - just navigate to the position
          console.log('[F12] Navigating within same file')
          ed.setPosition({
            lineNumber: definition.range.startLineNumber,
            column: definition.range.startColumn,
          })
          ed.revealLineInCenter(definition.range.startLineNumber)
        }
      },
    })
    console.log('[Editor Mount] Go to Definition action registered')

    // Also handle Cmd/Ctrl + Click (go to definition)
    console.log('[Editor Mount] Setting up mouse handler...')
    editor.onMouseDown(async (e) => {
      console.log('[Mouse Click] Mouse down event:', {
        leftButton: e.event.leftButton,
        ctrlKey: e.event.ctrlKey,
        metaKey: e.event.metaKey,
        hasPosition: !!e.target.position,
      })

      if (e.event.leftButton && (e.event.ctrlKey || e.event.metaKey) && e.target.position) {
        console.log('[Mouse Click] Cmd/Ctrl + Click detected, getting definitions...')
        const model = editor.getModel()
        if (!model) {
          console.log('[Mouse Click] No model available')
          return
        }

        const definitions = await getDefinitions(model, e.target.position)
        if (!definitions || definitions.length === 0) {
          console.log('[Mouse Click] No definitions returned')
          return
        }

        const definition = definitions[0]
        const targetUri = definition.uri.toString()
        const currentUri = model.uri.toString()

        console.log('[Mouse Click] Definition found:', {
          targetUri,
          currentUri,
          isSameFile: targetUri === currentUri,
        })

        if (targetUri !== currentUri) {
          // Extract the file path from the URI and strip sandbox prefix
          let filePath = targetUri.replace('file://', '')
          // Remove /vercel/sandbox prefix if present (from sandbox LSP)
          filePath = filePath.replace(/^\/vercel\/sandbox/, '')
          console.log('[Mouse Click] Opening file in new tab:', filePath)
          if (onOpenFileRef.current) {
            onOpenFileRef.current(filePath, definition.range.startLineNumber)
          } else {
            console.log('[Mouse Click] onOpenFile callback not available')
          }
        } else {
          console.log('[Mouse Click] Navigating within same file')
          editor.setPosition({
            lineNumber: definition.range.startLineNumber,
            column: definition.range.startColumn,
          })
          editor.revealLineInCenter(definition.range.startLineNumber)
        }
      }
    })
    console.log('[Editor Mount] Mouse handler set up')
    console.log('[Editor Mount] Editor mount complete!')
  }

  // Keyboard shortcut for save (Cmd/Ctrl + S) - fallback for outside editor
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        console.log('[Save Command] Cmd/Ctrl + S pressed globally')
        e.preventDefault()
        if (handleSaveRef.current) {
          console.log('[Save Command] Calling handleSave from global handler')
          handleSaveRef.current()
        } else {
          console.log('[Save Command] handleSaveRef.current is null in global handler!')
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Check if this is a node_modules file (read-only)
  const isNodeModulesFile = filename.includes('/node_modules/')

  // Remote files (from GitHub) should be read-only
  // 'remote' = Changes view showing remote files
  // 'all' = Files view showing remote files (should also be read-only)
  const isRemoteFile = viewMode === 'remote' || viewMode === 'all'
  const isReadOnly = isNodeModulesFile || isRemoteFile

  return (
    <div className="flex flex-col h-full">
      {isNodeModulesFile && (
        <div className="px-3 py-2 text-xs bg-amber-500/10 border-b border-amber-500/20 text-amber-600 dark:text-amber-400">
          Read-only: node_modules file
        </div>
      )}
      {isRemoteFile && !isNodeModulesFile && (
        <div className="px-3 py-2 text-xs bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400">
          Read-only: Remote file (from GitHub)
        </div>
      )}
      <Editor
        height="100%"
        language={getLanguageFromPath(filename)}
        value={content}
        onChange={handleContentChange}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        theme={currentTheme === 'dark' ? 'vercel-dark' : 'vercel-light'}
        options={{
          readOnly: isReadOnly,
          minimap: { enabled: false },
          fontSize: fontSize,
          fontFamily: 'var(--font-geist-mono), "Geist Mono", Menlo, Monaco, "Courier New", monospace',
          lineNumbers: 'on',
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          insertSpaces: true,
          folding: true,
          foldingStrategy: 'indentation',
          showFoldingControls: 'mouseover',
          matchBrackets: 'always',
          autoClosingBrackets: 'always',
          autoClosingQuotes: 'always',
          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
        }}
      />
    </div>
  )
}
