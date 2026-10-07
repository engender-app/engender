export { navigating, updated } from './app-state-stub';
export const page = $state({
  url: new URL('http://localhost/'),
  params: {} as Record<string, string>,
  route: { id: null as string | null },
  status: 200,
  error: null,
  data: {},
  form: null,
  state: {}
});

export function setScreenRoute(route: string): void {
  const url = new URL(route, location.origin);
  const parts = url.pathname.split('/');
  page.params =
    parts[1] === 'day'
      ? { day: parts[2] }
      : parts[1] === 'entry' && parts[2] === 'new'
        ? { day: parts[3] }
        : parts[1] === 'entry'
          ? { id: parts[2] }
          : {};
  page.url = url;
}
