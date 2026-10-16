// Side-effect module: main.tsx imports it before App, so the listeners are in place before App and
// the screens it draws evaluate. The reporter's own imports (the API client, the shared schemas)
// evaluate first, so an error thrown while those initialise is not reported.
import { installGlobalErrorReporting } from '../net/client-errors.ts';

installGlobalErrorReporting();
