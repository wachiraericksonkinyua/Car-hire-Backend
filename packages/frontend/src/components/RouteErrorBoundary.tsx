import { Component, type PropsWithChildren } from 'react'
import { t } from '../i18n'
import { ErrorState } from './ui'

type State = { hasError: boolean }

export class RouteErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  retry = () => this.setState({ hasError: false })

  render() {
    if (this.state.hasError) {
      return <ErrorState onRetry={this.retry} retryLabel={t('admin.routeRetry')} title={t('admin.routeError')} />
    }
    return this.props.children
  }
}