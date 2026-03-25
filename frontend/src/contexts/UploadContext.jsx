import { createContext, useContext, useRef, useState } from 'react'
import { api } from '../api/client'

const UploadContext = createContext(null)

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState([])
  const [recentCompletions, setRecentCompletions] = useState([])
  const idRef = useRef(0)

  function enqueueUpload(classId, assignmentId, topic, file, onSuccess) {
    const id = ++idRef.current
    const originPath = window.location.pathname
    const controller = new AbortController()

    setUploads((prev) => [
      ...prev,
      { id, filename: file.name, status: 'uploading', originPath, classId, assignmentId, topic, abort: () => controller.abort() },
    ])

    const formData = new FormData()
    formData.append('file', file)

    api.uploadTopicAttachment(classId, assignmentId, topic, formData, controller.signal)
      .then((added) => {
        setUploads((prev) =>
          prev.map((u) => (u.id === id ? { ...u, status: 'done' } : u))
        )
        onSuccess?.(added)
        // Record completion so any mounted component can sync its local list
        setRecentCompletions((prev) => [
          ...prev,
          { completionId: id, classId, assignmentId, topic, added },
        ])
        setTimeout(() => {
          setUploads((prev) => prev.filter((u) => u.id !== id))
        }, 3000)
      })
      .catch((err) => {
        // Silently drop aborted uploads
        if (err.name === 'AbortError' || controller.signal.aborted) return
        setUploads((prev) =>
          prev.map((u) =>
            u.id === id ? { ...u, status: 'error', error: err.message } : u
          )
        )
      })
  }

  function abortUpload(id) {
    setUploads((prev) => {
      const upload = prev.find((u) => u.id === id)
      upload?.abort?.()
      return prev.filter((u) => u.id !== id)
    })
  }

  function dismissUpload(id) {
    setUploads((prev) => prev.filter((u) => u.id !== id))
  }

  return (
    <UploadContext.Provider value={{ uploads, recentCompletions, enqueueUpload, abortUpload, dismissUpload }}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUpload() {
  return useContext(UploadContext)
}

/** Returns in-flight uploads for the given topic context. */
export function useTopicUploads(classId, assignmentId, topic) {
  const { uploads } = useUpload()
  return uploads.filter(
    (u) =>
      u.status === 'uploading' &&
      String(u.classId) === String(classId) &&
      String(u.assignmentId) === String(assignmentId) &&
      u.topic === topic
  )
}

/** Returns true if there's an active upload for the given topic context. */
export function useTopicUploading(classId, assignmentId, topic) {
  return useTopicUploads(classId, assignmentId, topic).length > 0
}
