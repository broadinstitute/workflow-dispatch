import * as core from '@actions/core';
import * as github from '@actions/github';
import { WorkflowHandler, WorkflowRunStatus, WorkflowRunConclusion } from '../src/workflow-handler';

jest.mock('@actions/core');
jest.mock('@actions/github');

describe('WorkflowHandler', () => {
    let mockOctokit: any;
    let handler: WorkflowHandler;

    const token = 'secret-token';
    const workflowRef = 'test-workflow.yaml';
    const owner = 'owner';
    const repo = 'repo';
    const ref = 'refs/heads/master';
    const runName = 'test-run';

    beforeEach(() => {
        jest.clearAllMocks();

        mockOctokit = {
            rest: {
                actions: {
                    createWorkflowDispatch: jest.fn(),
                    listRepoWorkflows: jest.fn(),
                    listWorkflowRuns: jest.fn(),
                    getWorkflowRun: jest.fn(),
                    getWorkflowRunArtifacts: jest.fn()
                }
            }
        };

        (github.getOctokit as jest.Mock).mockReturnValue(mockOctokit);
        
        // Mock Date.now to control filtering logic
        jest.spyOn(Date, 'now').mockReturnValue(1600000000000); 
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('triggerWorkflow', () => {
        it('should trigger workflow by filename', async () => {
            handler = new WorkflowHandler(token, 'workflow.yaml', owner, repo, ref, runName);
            const inputs = { key: 'value' };

            await handler.triggerWorkflow(inputs);

            expect(mockOctokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
                owner,
                repo,
                workflow_id: 'workflow.yaml',
                ref,
                inputs
            });
        });

        it('should trigger workflow by name by resolving ID', async () => {
            handler = new WorkflowHandler(token, 'My Workflow', owner, repo, ref, runName);
            const inputs = { key: 'value' };

            mockOctokit.rest.actions.listRepoWorkflows.mockResolvedValue({
                data: {
                    workflows: [
                        { id: 123, name: 'Other Workflow' },
                        { id: 456, name: 'My Workflow' }
                    ]
                }
            });

            await handler.triggerWorkflow(inputs);

            expect(mockOctokit.rest.actions.listRepoWorkflows).toHaveBeenCalled();
            expect(mockOctokit.rest.actions.createWorkflowDispatch).toHaveBeenCalledWith({
                owner,
                repo,
                workflow_id: 456,
                ref,
                inputs
            });
        });

        it('should throw error if workflow name not found', async () => {
            handler = new WorkflowHandler(token, 'Missing Workflow', owner, repo, ref, runName);
            
            mockOctokit.rest.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [] }
            });

            await expect(handler.triggerWorkflow({})).rejects.toThrow("Unable to find workflow 'Missing Workflow'");
        });
    });

    describe('getWorkflowRunStatus', () => {
        it('should return run status when run is found', async () => {
            handler = new WorkflowHandler(token, 'workflow.yaml', owner, repo, ref, runName);

            // Mock listWorkflowRuns to return a run created slightly after triggerDate
            // Trigger date is set in triggerWorkflow. We need to simulate that or set it manually?
            // WorkflowHandler relies on triggerWorkflow being called first to set triggerDate.
            
            // However, we can also just rely on the fact that if triggerDate is 0 (default), it includes everything.
            // But verify triggerWorkflow sets it.
            await handler.triggerWorkflow({}); 

            // Mock list runs
            mockOctokit.rest.actions.listWorkflowRuns.mockResolvedValue({
                data: {
                    workflow_runs: [
                        { id: 789, created_at: new Date(1600000001000).toISOString(), name: runName } // 1s after mock Date.now
                    ]
                }
            });

            // Mock get run
            mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
                data: {
                    id: 789,
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'http://run-url'
                }
            });

            const status = await handler.getWorkflowRunStatus();
            
            expect(status).toEqual({
                url: 'http://run-url',
                status: WorkflowRunStatus.COMPLETED,
                conclusion: WorkflowRunConclusion.SUCCESS
            });
        });

        it('should filter runs by created_at and runName', async () => {
             // Mock Date.now to T0
             const T0 = 1000000000000;
             jest.spyOn(Date, 'now').mockReturnValue(T0);
             
             handler = new WorkflowHandler(token, 'workflow.yaml', owner, repo, ref, 'target-run');
             await handler.triggerWorkflow({}); // Sets triggerDate to T0 (floored)

             // Mock list runs with old run and new run with wrong name
             mockOctokit.rest.actions.listWorkflowRuns.mockResolvedValue({
                 data: {
                     workflow_runs: [
                         { id: 1, created_at: new Date(T0 - 5000).toISOString(), name: 'target-run' }, // old
                         { id: 2, created_at: new Date(T0 + 5000).toISOString(), name: 'wrong-name' }, // wrong name
                         { id: 3, created_at: new Date(T0 + 5000).toISOString(), name: 'target-run' }, // MATCH
                     ]
                 }
             });

             // Mock get run for ID 3
             mockOctokit.rest.actions.getWorkflowRun.mockResolvedValue({
                data: { id: 3, status: 'queued', conclusion: null, html_url: 'url' }
            });

             const status = await handler.getWorkflowRunStatus();
             expect(mockOctokit.rest.actions.getWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({ run_id: 3 }));
        });
    });
});
