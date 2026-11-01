from . import common, layouts, layouts_shots, layouts_portrait
from .explainers import retrieve, pipeline, tile, clip, roundtrip, ring_of, step, meter
from .bgm import music
from .common import W, H, el, video, image, sub_rect, presenter, source, canvas, captions, finalize, word_at, configure, relight, retire, look_back, recall, behind_word, freeze_sticker, card, tag, stat, name, stamp, rise, multiply, erode, strike, marker, restyle, beat, phrases, loop, dialog, notify, glass, state, row, chip, punch, snap, back, push
from .common import vis_swap, vis_phone, vis_flow, flow_row, flow_node, vis_bars, bar, vis_frame, vis_poll, vis_stamp

_PRESETS = ["before_after", "demo_steps", "example_stat_kinds", "feature_cards", "cause_chain", "compare", "shot_focus", "shot_then_timeline", "evidence_wall"]


def _dispatch(name):
    land = getattr(layouts, name, None) or getattr(layouts_shots, name)
    port = getattr(layouts_portrait, name)

    def preset(*args, **kwargs):
        return (port if common.PORTRAIT else land)(*args, **kwargs)
    preset.__name__ = name
    preset.__doc__ = land.__doc__
    return preset


for _n in _PRESETS:
    globals()[_n] = _dispatch(_n)
