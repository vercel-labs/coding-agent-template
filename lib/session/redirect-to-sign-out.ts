export async function redirectToSignOut(): Promise<void> {
  const res = await fetch(
    `/api/auth/signout?${new URLSearchParams({
      next: window.location.pathname,
    }).toString()}`,
  )

  const { url } = await res.json()
  window.location = url
  if (window.location.hash) {
    window.location.reload()
  }
}
