/** Observe every context, including requests initiated by service workers. */
export function observeBuildRequests(origin) {
  const allRequests = [];
  const externalRequests = [];
  return {
    allRequests,
    externalRequests,
    observe(context) {
      const requests = [];
      context.on('request', (request) => {
        const url = request.url();
        requests.push(url);
        allRequests.push(url);
        if (new URL(url).origin !== origin) externalRequests.push(url);
      });
      return requests;
    }
  };
}
