import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, Injectable } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling, RouterStateSnapshot } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { routes } from './app.routes';
import { ApiProblem } from './core/http/api-problem';
import { authInterceptor, correlationIdInterceptor, problemInterceptor } from './core/http/interceptors';

@Injectable({ providedIn: 'root' })
export class PortalTitleStrategy extends TitleStrategy {
  constructor(private readonly title: Title) {
    super();
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · Go Kinetic Business` : 'Go Kinetic Business');
  }
}

/** Handled API problems are shown inline by components; only genuinely unexpected errors are logged. */
@Injectable()
export class PortalErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    const err = (error as { rejection?: unknown })?.rejection ?? error;
    if (err instanceof ApiProblem) return;
    console.error('Unhandled client error', err);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    // Order matters: the problem mapper runs innermost so it sees raw HttpErrorResponses.
    provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
    { provide: TitleStrategy, useClass: PortalTitleStrategy },
    { provide: ErrorHandler, useClass: PortalErrorHandler }
  ]
};
