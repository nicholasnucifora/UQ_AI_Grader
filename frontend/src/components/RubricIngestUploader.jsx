import { useRef, useState } from 'react'
import { api } from '../api/client'

export default function RubricIngestUploader({ onRubricExtracted, onError }) {
  const inputRef = useRef(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleFile(file) {
    if (!file) return
    setIsLoading(true)
    setErrorMsg('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const data = await api.ingestRubric(formData)
      if (data.rubric) {
        onRubricExtracted(data.rubric)
      } else {
        const msg = data.error || 'Failed to extract rubric from document.'
        setErrorMsg(msg)
        onError?.(msg)
      }
    } catch (err) {
      const msg = err.message || 'Upload failed.'
      setErrorMsg(msg)
      onError?.(msg)
    } finally {
      setIsLoading(false)
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    handleFile(e.dataTransfer.files[0])
  }

  function handleDragOver(e) {
    e.preventDefault()
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Upload Rubric Document (optional)
      </label>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => !isLoading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors ${
          isLoading
            ? 'border-blue-300 bg-blue-50 cursor-wait'
            : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        {isLoading ? (
          <div className="flex flex-col items-center gap-2 text-blue-600">
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">Extracting rubric…</span>
          </div>
        ) : (
          <div className="text-sm text-gray-500 space-y-1">
            <p className="font-medium text-gray-700">Drop PDF, DOCX, or Image here</p>
            <p>or click to browse</p>
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="text-sm text-red-600">
          {errorMsg} — you can still build the rubric manually below.
        </p>
      )}
    </div>
  )
}
