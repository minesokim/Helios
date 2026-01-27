'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface UploadedFile {
  id: string
  name: string
  size: number
  status: 'uploading' | 'processing' | 'complete' | 'error'
  progress: number
  error?: string
  documentId?: string
}

interface FileUploadProps {
  onUploadComplete?: (documentIds: string[]) => void
}

export function FileUpload({ onUploadComplete }: FileUploadProps) {
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isUploading, setIsUploading] = useState(false)

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return

    setIsUploading(true)
    const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).slice(2),
      name: file.name,
      size: file.size,
      status: 'uploading' as const,
      progress: 0,
    }))

    setFiles((prev) => [...prev, ...newFiles])

    const uploadedIds: string[] = []

    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i]
      const fileState = newFiles[i]

      try {
        // Upload file
        const formData = new FormData()
        formData.append('file', file)

        const uploadRes = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          throw new Error('Upload failed')
        }

        const { document } = await uploadRes.json()

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileState.id
              ? { ...f, status: 'processing' as const, progress: 50, documentId: document.id }
              : f
          )
        )

        // Process document (OCR, categorization, embeddings)
        const processRes = await fetch('/api/documents/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: document.id }),
        })

        if (!processRes.ok) {
          throw new Error('Processing failed')
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileState.id
              ? { ...f, status: 'complete' as const, progress: 100 }
              : f
          )
        )

        uploadedIds.push(document.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileState.id
              ? { ...f, status: 'error' as const, error: message }
              : f
          )
        )
      }
    }

    setIsUploading(false)

    if (uploadedIds.length > 0 && onUploadComplete) {
      onUploadComplete(uploadedIds)
    }
  }, [onUploadComplete])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'text/*': ['.txt', '.csv'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    disabled: isUploading,
  })

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      <Card
        {...getRootProps()}
        className={`cursor-pointer border-2 border-dashed transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        } ${isUploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          {isDragActive ? (
            <p className="text-lg font-medium">Drop files here</p>
          ) : (
            <>
              <p className="text-lg font-medium">
                Drag and drop files here
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Supports PDF, images, Word docs, and text files
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {files.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  <File className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{formatSize(file.size)}</span>
                      {file.status === 'uploading' && (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Uploading...
                        </span>
                      )}
                      {file.status === 'processing' && (
                        <span className="flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing...
                        </span>
                      )}
                      {file.status === 'complete' && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          Complete
                        </span>
                      )}
                      {file.status === 'error' && (
                        <span className="flex items-center gap-1 text-red-600">
                          <AlertCircle className="h-3 w-3" />
                          {file.error}
                        </span>
                      )}
                    </div>
                    {(file.status === 'uploading' || file.status === 'processing') && (
                      <Progress value={file.progress} className="h-1 mt-2" />
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(file.id)}
                    disabled={file.status === 'uploading' || file.status === 'processing'}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
