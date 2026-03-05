import * as core from '@actions/core';
import * as github from '@actions/github';
import { run } from '../src/main';
import { WorkflowHandler, WorkflowRunStatus, WorkflowRunConclusion } from '../src/workflow-handler';
import * as utils from '../src/utils';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/github');
jest.mock('../src/workflow-handler');
jest.mock('../src/utils', () => {
    const original = jest.requireActual('../src/utils');
    return {
        ...original,
        sleep: jest.fn(), // Mock sleep to avoid dragging tests
        isTimedOut: jest.fn()
    };
});

describe('Main Run Loop', () => {
    let mockWorkflowHandlerInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock WorkflowHandler instance
        mockWorkflowHandlerInstance = {
            triggerWorkflow: jest.fn(),
            getWorkflowRunStatus: jest.fn(),
            getWorkflowRunArtifacts: jest.fn()
        };

        (WorkflowHandler as jest.Mock).mockImplementation(() => mockWorkflowHandlerInstance);

        // Mock github context
        (github as any).context = {
            repo: {
                owner: 'owner',
                repo: 'repo'
            },
            ref: 'refs/heads/master'
        };

        // Default utils mocks
        (utils.sleep as jest.Mock).mockResolvedValue(undefined);
        (utils.isTimedOut as jest.Mock).mockReturnValue(false); // Default not timed out
    });

    // Helper to setup inputs
    const setInputs = (inputs: Record<string, string>) => {
        (core.getInput as jest.Mock).mockImplementation((name: string) => {
            return inputs[name] || (name.endsWith('timeout') || name.endsWith('interval') ? '1m' : '');
        });
    };

    it('should run echo-1-test scenario (trigger only)', async () => {
        setInputs({
            'token': 'secret',
            'workflow': 'Message Echo 1',
            'wait-for-completion': 'false'
        });

        await run();

        expect(WorkflowHandler).toHaveBeenCalledWith('secret', 'Message Echo 1', expect.any(String), expect.any(String), expect.any(String), expect.any(String));
        expect(mockWorkflowHandlerInstance.triggerWorkflow).toHaveBeenCalled();
        expect(mockWorkflowHandlerInstance.getWorkflowRunStatus).not.toHaveBeenCalled(); // Should not wait
    });

    it('should run echo-2-test scenario (trigger by filename)', async () => {
        setInputs({
            'token': 'secret',
            'workflow': 'echo-02.yaml',
            'wait-for-completion': 'false'
        });

        await run();

        expect(WorkflowHandler).toHaveBeenCalledWith(expect.any(String), 'echo-02.yaml', expect.any(String), expect.any(String), expect.any(String), expect.any(String));
        expect(mockWorkflowHandlerInstance.triggerWorkflow).toHaveBeenCalled();
    });

    it('should run long-running-test scenario (trigger and wait success)', async () => {
        setInputs({
            'token': 'secret',
            'workflow': 'long-running.yml',
            'wait-for-completion': 'true',
            'wait-for-completion-timeout': '5m',
            'wait-for-completion-interval': '10s'
        });

        // Sequence of status checks: queued -> in_progress -> completed(success)
        mockWorkflowHandlerInstance.getWorkflowRunStatus
            .mockResolvedValueOnce({ status: WorkflowRunStatus.QUEUED })
            .mockResolvedValueOnce({ status: WorkflowRunStatus.IN_PROGRESS, url: 'http://url' })
            .mockResolvedValueOnce({ status: WorkflowRunStatus.COMPLETED, conclusion: WorkflowRunConclusion.SUCCESS, url: 'http://url' });

        await run();

        expect(mockWorkflowHandlerInstance.triggerWorkflow).toHaveBeenCalled();
        expect(mockWorkflowHandlerInstance.getWorkflowRunStatus).toHaveBeenCalledTimes(3);
        expect(core.setOutput).toHaveBeenCalledWith('workflow-conclusion', 'success');
        expect(core.setFailed).not.toHaveBeenCalled();
    });

    it('should run failing-test scenario (trigger and wait failure)', async () => {
        setInputs({
            'token': 'secret',
            'workflow': 'failing.yml',
            'wait-for-completion': 'true'
        });

        mockWorkflowHandlerInstance.getWorkflowRunStatus
            .mockResolvedValue({ status: WorkflowRunStatus.COMPLETED, conclusion: WorkflowRunConclusion.FAILURE, url: 'http://fail' });

        await run();

        expect(core.setOutput).toHaveBeenCalledWith('workflow-conclusion', 'failure');
        expect(core.setFailed).toHaveBeenCalledWith('Workflow run has failed');
    });

    it('should run timeout-test scenario', async () => {
        setInputs({
            'token': 'secret',
            'workflow': 'timeout.yml',
            'wait-for-completion': 'true',
            'wait-for-completion-timeout': '1s'
        });

        // Mock always running
        mockWorkflowHandlerInstance.getWorkflowRunStatus
            .mockResolvedValue({ status: WorkflowRunStatus.IN_PROGRESS });

        // Force timeout after a few calls
        let callCount = 0;
        (utils.isTimedOut as jest.Mock).mockImplementation(() => {
            callCount++;
            return callCount > 2; // Time out after 2 checks
        });

        await run();

        expect(core.setOutput).toHaveBeenCalledWith('workflow-conclusion', 'timed_out');
        expect(core.setFailed).toHaveBeenCalledWith('Workflow run has failed due to timeout');
    });

});
