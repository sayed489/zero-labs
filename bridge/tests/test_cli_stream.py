import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'overlay'))
import cli_launch

class Job:
    def __init__(self):
        self.events = []
        self.runner_state = {}
        self.result_text = ''
    def add_event(self, kind, **data):
        self.events.append({'kind': kind, **data})

class StreamTests(unittest.TestCase):
    def test_opencode_multiple_text_parts_all_reach_browser(self):
        job = Job()
        for text in ['First paragraph.', 'Second paragraph.', 'Conclusion.']:
            cli_launch.handle_stream_line(job, json.dumps({'type': 'text', 'sessionID': 'session', 'part': {'type': 'text', 'text': text}}))
        self.assertEqual([e['text'] for e in job.events], ['First paragraph.', 'Second paragraph.', 'Conclusion.'])
        self.assertEqual(job.new_session_id, 'session')

    def test_nonzero_exit_cannot_be_hidden_by_partial_output(self):
        job = Job()
        job.add_event('text', text='Working…')
        self.assertFalse(cli_launch.finalize_job(job, 1, 'Authentication expired'))
        self.assertEqual(job.events[-1]['kind'], 'error')

    def test_structured_error_with_zero_exit_is_still_a_failure(self):
        job = Job()
        job.add_event('text', text='Working…')
        cli_launch.handle_stream_line(job, '{"type":"error","message":"Provider unavailable"}')
        self.assertFalse(cli_launch.finalize_job(job, 0, ''))

    def test_successful_output_remains_successful(self):
        job = Job()
        job.add_event('text', text='Done')
        self.assertTrue(cli_launch.finalize_job(job, 0, ''))
