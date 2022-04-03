import { IPicGo, IPluginConfig, IUpyunConfig } from '../../types'
import crypto from 'crypto'
import MD5 from 'md5'
import { Options } from 'request-promise-native'
import { IBuildInEvent } from '../../utils/enum'
import { ILocalesKey } from '../../i18n/zh-CN'
import { safeParse } from '../../utils/common'

// generate COS signature string
const generateSignature = (options: IUpyunConfig, fileName: string): string => {
  const path = options.path || ''
  const operator = options.operator
  const password = options.password
  const md5Password = MD5(password)
  const date = new Date().toUTCString()
  const uri = `/${options.bucket}/${encodeURI(path)}${encodeURI(fileName)}`
  const value = `PUT&${uri}&${date}`
  const sign = crypto.createHmac('sha1', md5Password).update(value).digest('base64')
  return `UPYUN ${operator}:${sign}`
}

const postOptions = (options: IUpyunConfig, fileName: string, signature: string, image: Buffer): Options => {
  const bucket = options.bucket
  const path = options.path || ''
  return {
    method: 'PUT',
    url: `https://v0.api.upyun.com/${bucket}/${encodeURI(path)}${encodeURI(fileName)}`,
    headers: {
      Authorization: signature,
      Date: new Date().toUTCString()
    },
    body: image,
    resolveWithFullResponse: true
  }
}

const handle = async (ctx: IPicGo): Promise<IPicGo> => {
  const upyunOptions = ctx.getConfig<IUpyunConfig>('picBed.upyun')
  if (!upyunOptions) {
    throw new Error('Can\'t find upYun config')
  }
  try {
    const imgList = ctx.output
    const path = upyunOptions.path || ''
    for (const img of imgList) {
      if (img.fileName && img.buffer) {
        let image = img.buffer
        if (!image && img.base64Image) {
          image = Buffer.from(img.base64Image, 'base64')
        }
        const signature = generateSignature(upyunOptions, img.fileName)
        const options = postOptions(upyunOptions, img.fileName, signature, image)
        const body = await ctx.Request.request(options)
        if (body.statusCode === 200) {
          delete img.base64Image
          delete img.buffer
          img.imgUrl = `${upyunOptions.url}/${path}${img.fileName}${upyunOptions.options}`
        } else {
          throw new Error('Upload failed')
        }
      }
    }
    return ctx
  } catch (err: any) {
    if (err.message === 'Upload failed') {
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: ctx.i18n.translate<ILocalesKey>('CHECK_SETTINGS')
      })
    } else {
      const body = safeParse<{ code: string }>(err.error)
      ctx.emit(IBuildInEvent.NOTIFICATION, {
        title: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED'),
        body: ctx.i18n.translate<ILocalesKey>('UPLOAD_FAILED_REASON', {
          code: typeof body === 'object' ? body.code : body
        }),
        text: 'http://docs.upyun.com/api/errno/'
      })
    }
    throw err
  }
}

const config = (ctx: IPicGo): IPluginConfig[] => {
  const userConfig = ctx.getConfig<IUpyunConfig>('picBed.upyun') || {}
  const config: IPluginConfig[] = [
    {
      name: 'bucket',
      type: 'input',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN'),
      default: userConfig.bucket || '',
      required: true
    },
    {
      name: 'operator',
      type: 'input',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_OPERATOR'),
      default: userConfig.operator || '',
      required: true
    },
    {
      name: 'password',
      type: 'password',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_PASSWORD'),
      default: userConfig.password || '',
      required: true
    },
    {
      name: 'url',
      type: 'input',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_URL'),
      default: userConfig.url || '',
      required: true
    },
    {
      name: 'options',
      type: 'input',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_OPTIONS'),
      default: userConfig.options || '',
      required: true
    },
    {
      name: 'path',
      type: 'input',
      alias: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN_PATH'),
      default: userConfig.path || '',
      required: false
    }
  ]
  return config
}

export default function register (ctx: IPicGo): void {
  ctx.helper.uploader.register('upyun', {
    name: ctx.i18n.translate<ILocalesKey>('PICBED_UPYUN'),
    handle,
    config
  })
}
