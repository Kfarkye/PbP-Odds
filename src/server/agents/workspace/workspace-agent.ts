import { AuraAgent, RouteContext, AgentResponse } from '../types';

export class WorkspaceAgent implements AuraAgent {
  public readonly id = 'workspace-agent';
  public readonly name = 'Workspace Agent';

  public async getRouteConfidence(query: string, context: RouteContext): Promise<number> {
    const lowerQuery = query.toLowerCase();
    const workspaceKeywords = ['email', 'gmail', 'calendar', 'meeting', 'schedule', 'drive', 'doc', 'task', 'todo'];

    if (context.domain === 'workspace') {
      return 0.95;
    }

    const hasKeyword = workspaceKeywords.some(keyword => lowerQuery.includes(keyword));
    if (hasKeyword) {
      return 0.85;
    }

    return 0.10;
  }

  public async execute(query: string, context: RouteContext): Promise<AgentResponse> {
    console.log(`[WorkspaceAgent] Executing task for query: "${query}"`);

    // 1. CONSUME PAYLOAD CARRIER (Bypass redundant NLP parsing)
    const carrier = context.payloadCarrier || {};
    let targetEmail = carrier.targetEmail;
    let targetDate = carrier.targetDate;
    let taskSubject = carrier.taskSubject;

    if (targetEmail || targetDate || taskSubject) {
      console.log(`[WorkspaceAgent] Bypassing NLP. Using pre-extracted slots:`, { targetEmail, targetDate, taskSubject });
    } else {
      // Fallback to local parsing if no pre-extracted parameters exist
      console.log(`[WorkspaceAgent] No carrier payload found. Running local query extraction...`);
      targetEmail = this.extractEmail(query);
      targetDate = this.extractDate(query);
      taskSubject = query;
    }

    // 2. SECURE AUTHENTICATION GATE
    if (!context.accessToken) {
      console.warn(`[WorkspaceAgent] Missing OAuth credentials. Yielding to General Agent for Auth Challenge.`);
      return {
        success: false,
        output: null,
        handoffTo: 'general-agent',
        handoffPayload: {
          authRequired: true,
          originalQuery: query
        }
      };
    }

    try {
      // Execute Google Workspace integrations using target parameters
      const result = await this.executeWorkspaceAction(targetEmail, targetDate, taskSubject, context.accessToken);
      return {
        success: true,
        output: result
      };
    } catch (error: any) {
      console.error(`[WorkspaceAgent] Execution failed:`, error);
      return {
        success: false,
        output: null,
        handoffTo: 'general-agent',
        handoffPayload: {
          error: error.message,
          originalQuery: query
        }
      };
    }
  }

  private extractEmail(query: string): string | undefined {
    const match = query.match(/[\w.-]+@[\w.-]+\.\w+/);
    return match ? match[0] : undefined;
  }

  private extractDate(query: string): string | undefined {
    // Simple regex or date parser fallback
    return undefined;
  }

  private async executeWorkspaceAction(email: string | undefined, date: string | undefined, subject: string, token: string): Promise<any> {
    // Integration logic with Google APIs
    return { status: 'SUCCESS', message: 'Workspace task processed successfully.' };
  }
}
