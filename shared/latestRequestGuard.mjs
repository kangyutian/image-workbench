export function createLatestRequestGuard() {
  let currentToken = 0;

  return {
    begin() {
      currentToken += 1;
      return currentToken;
    },
    cancel() {
      currentToken += 1;
    },
    isCurrent(token) {
      return token === currentToken;
    },
  };
}
