// Wrap async handlers so rejections reach the /api/v1 error handler.
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
