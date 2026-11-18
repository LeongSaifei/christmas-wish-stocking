"""重新生成 public/fonts 下的子集字体。改了标题或手写文案后运行：
  pip install fonttools brotli
  python scripts/subset-fonts.py <NotoSerifSC-SemiBold 或可变字体.ttf> <LXGWWenKai-Regular.ttf>
只把用到的汉字裁出来，两个文件合计约几十 KB。"""
import sys, subprocess, tempfile
from fontTools.ttLib import TTFont

SERIF = "圣诞心愿邮局把小小心愿，装进圣诞袜。亲爱的圣诞老人，心愿已妥善收藏关于你的心愿把圣诞分享出去打开圣诞袜写下小小心愿寄出圣诞期待123"
HAND = ("一份礼物，一个值得期待的冬天轻点袜子，让心愿住进来我想把这份小小的期待，寄给你。"
        "不必很大，认真就好愿你被这个冬天温柔以待你的期待已保存到邮局。愿惊喜在这个圣诞，轻轻敲门。点右上角发送给朋友或分享到朋友圈")

def subset(src, text, out):
    chars = "".join(sorted(set(text))) + " "
    subprocess.run(["pyftsubset", src, f"--text={chars}", "--flavor=woff2", f"--output-file={out}",
                    "--layout-features=*", "--no-hinting", "--desubroutinize"], check=True)

serif_src, hand_src = sys.argv[1], sys.argv[2]
font = TTFont(serif_src)
if "fvar" in font:  # 可变字体先固定到 600 字重
    from fontTools.varLib import instancer
    tmp = tempfile.NamedTemporaryFile(suffix=".ttf", delete=False).name
    instancer.instantiateVariableFont(font, {"wght": 600}).save(tmp)
    serif_src = tmp
subset(serif_src, SERIF, "public/fonts/title.woff2")
subset(hand_src, HAND, "public/fonts/hand.woff2")
print("done")
