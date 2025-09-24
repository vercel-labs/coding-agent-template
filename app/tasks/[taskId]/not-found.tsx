import { AlertCircle } from 'lucide-react'

export default function TaskNotFound() {
  return (
    <div className="flex-1 bg-background flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Task Not Found</h1>
        <p className="text-muted-foreground">
          The task you&apos;re looking for doesn&apos;t exist or may have been deleted.
        </p>
      </div>
    </div>
  )
}
