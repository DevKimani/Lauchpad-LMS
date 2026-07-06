// Shared avatar: shows a photo when `url` is present, otherwise an orange
// initials circle. Size, font-size, and other styles are controlled entirely
// by the caller through `className`.
export default function Avatar({ url, name, className = '' }) {
  const initials = name
    ? name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    : '?'

  if (url) {
    return (
      <img
        src={url}
        alt={name ?? ''}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-orange font-extrabold text-ink ${className}`}
    >
      {initials}
    </span>
  )
}
