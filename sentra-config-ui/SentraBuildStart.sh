cd "$(dirname "$0")"

if ! command -v node &> /dev/null
then
    echo "未检测到 Node.js，请先安装后再运行。"
    exit 1
fi

node scripts/start.js