const {
  createStreamLabelBrowserSource,
  streamLabelInputName,
  isLegacyTeamLabelInputName,
  labelRenderer,
  labelShutdownWhenHidden,
  labelOverlayUrl,
} = require('../streamLabel');

// Isolate the label env knobs so tests don't leak into each other or the runner.
const SAVED = {
  LABEL_RENDERER: process.env.LABEL_RENDERER,
  LABEL_SHUTDOWN_WHEN_HIDDEN: process.env.LABEL_SHUTDOWN_WHEN_HIDDEN,
  LABEL_OVERLAY_BASE_URL: process.env.LABEL_OVERLAY_BASE_URL,
};
function resetLabelEnv() {
  delete process.env.LABEL_RENDERER;
  delete process.env.LABEL_SHUTDOWN_WHEN_HIDDEN;
  delete process.env.LABEL_OVERLAY_BASE_URL;
}
beforeEach(resetLabelEnv);
afterAll(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('streamLabelInputName', () => {
  it('suffixes _label, distinct from the video source and every legacy label suffix', () => {
    const name = streamLabelInputName('jellyfish', 'jazzy');
    expect(name).toBe('jellyfish_jazzy_label');
    expect(name).not.toBe('jellyfish_jazzy'); // not the video source
    for (const suffix of ['_name_text', '_name_text_bg', '_team_bg', '_accent']) {
      expect(name.endsWith(suffix)).toBe(false);
    }
  });
});

describe('isLegacyTeamLabelInputName (deleteTeamComponents matcher)', () => {
  const grp = 'jellyfish';
  const text = 'jellyfish_text';

  it('does NOT match the _label browser source (prevents double-removal)', () => {
    expect(isLegacyTeamLabelInputName('jellyfish_jazzy_label', grp, text)).toBe(false);
  });

  it('matches the legacy native label inputs + shared team bg', () => {
    expect(isLegacyTeamLabelInputName('jellyfish_jazzy_name_text', grp, text)).toBe(true);
    expect(isLegacyTeamLabelInputName('jellyfish_jazzy_name_text_bg', grp, text)).toBe(true);
    expect(isLegacyTeamLabelInputName('jellyfish_jazzy_team_bg', grp, text)).toBe(true);
    expect(isLegacyTeamLabelInputName('jellyfish_jazzy_accent', grp, text)).toBe(true);
    expect(isLegacyTeamLabelInputName('jellyfish_text_bg', grp, text)).toBe(true);
  });

  it('does not match the video source or another team', () => {
    expect(isLegacyTeamLabelInputName('jellyfish_jazzy', grp, text)).toBe(false);
    expect(isLegacyTeamLabelInputName('other_jazzy_accent', grp, text)).toBe(false);
  });
});

describe('label env helpers', () => {
  it('labelRenderer defaults to html and honors obs', () => {
    expect(labelRenderer()).toBe('html');
    process.env.LABEL_RENDERER = 'OBS';
    expect(labelRenderer()).toBe('obs');
  });

  it('labelShutdownWhenHidden defaults true and honors falsey values', () => {
    expect(labelShutdownWhenHidden()).toBe(true);
    process.env.LABEL_SHUTDOWN_WHEN_HIDDEN = 'false';
    expect(labelShutdownWhenHidden()).toBe(false);
  });

  it('labelOverlayUrl builds the route and strips a trailing slash on the base', () => {
    expect(labelOverlayUrl(42)).toBe('http://localhost:3000/overlay/stream/42');
    process.env.LABEL_OVERLAY_BASE_URL = 'http://192.168.1.5:3000/';
    expect(labelOverlayUrl(7)).toBe('http://192.168.1.5:3000/overlay/stream/7');
  });
});

describe('createStreamLabelBrowserSource', () => {
  function makeCall(existingInputs = []) {
    return jest.fn(async (req) => {
      if (req === 'GetInputList') return { inputs: existingInputs };
      if (req === 'GetSceneItemList') {
        return { sceneItems: [{ sourceName: 'jellyfish_jazzy_label', sceneItemId: 7 }] };
      }
      if (req === 'CreateInput') return { inputUuid: 'u' };
      if (req === 'CreateSceneItem') return { sceneItemId: 7 };
      return {};
    });
  }
  const opts = {
    sceneName: 'jellyfish_jazzy_stream',
    cleanGroupName: 'jellyfish',
    cleanStreamName: 'jazzy',
    streamId: 42,
    lockSources: true,
  };

  it('creates a transparent browser_source with the overlay url + memory-safe flags, muted, positioned, locked', async () => {
    const call = makeCall([]);
    const name = await createStreamLabelBrowserSource({ call }, opts);

    expect(name).toBe('jellyfish_jazzy_label');

    const create = call.mock.calls.find(([r]) => r === 'CreateInput');
    expect(create[1]).toMatchObject({
      sceneName: 'jellyfish_jazzy_stream',
      inputName: 'jellyfish_jazzy_label',
      inputKind: 'browser_source',
      inputSettings: {
        url: 'http://localhost:3000/overlay/stream/42',
        width: 1920,
        height: 1080,
        restart_when_active: false,
        shutdown: true,
      },
    });

    const mute = call.mock.calls.find(([r]) => r === 'SetInputMute');
    expect(mute[1]).toEqual({ inputName: 'jellyfish_jazzy_label', inputMuted: true });

    const tf = call.mock.calls.find(([r]) => r === 'SetSceneItemTransform');
    expect(tf[1].sceneItemTransform).toMatchObject({ positionX: 0, positionY: 0, alignment: 5 });

    const lock = call.mock.calls.find(([r]) => r === 'SetSceneItemLocked');
    expect(lock[1]).toMatchObject({ sceneItemLocked: true });
  });

  it('updates settings (no CreateInput) when the label already exists', async () => {
    const call = makeCall([{ inputName: 'jellyfish_jazzy_label' }]);
    await createStreamLabelBrowserSource({ call }, opts);

    expect(call.mock.calls.some(([r]) => r === 'CreateInput')).toBe(false);
    const set = call.mock.calls.find(([r]) => r === 'SetInputSettings');
    expect(set[1]).toMatchObject({ inputName: 'jellyfish_jazzy_label', overlay: false });
  });

  it('honors shutdown:false when LABEL_SHUTDOWN_WHEN_HIDDEN=false', async () => {
    process.env.LABEL_SHUTDOWN_WHEN_HIDDEN = 'false';
    const call = makeCall([]);
    await createStreamLabelBrowserSource({ call }, opts);
    const create = call.mock.calls.find(([r]) => r === 'CreateInput');
    expect(create[1].inputSettings.shutdown).toBe(false);
  });

  it('does not lock when lockSources is false', async () => {
    const call = makeCall([]);
    await createStreamLabelBrowserSource({ call }, { ...opts, lockSources: false });
    expect(call.mock.calls.some(([r]) => r === 'SetSceneItemLocked')).toBe(false);
  });
});
