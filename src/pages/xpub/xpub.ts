import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams, Platform } from 'ionic-angular'
import { Clipboard } from '@ionic-native/clipboard'
import * as webClipboard from 'clipboard-polyfill'
import { Wallet } from '../../providers/providers'

/**
 * Generated class for the XpubPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-xpub',
  templateUrl: 'xpub.html',
})
export class XpubPage {

  public xpub: string
  public qrCodeURL: string

  constructor(
    public clipboard: Clipboard,
    public navCtrl: NavController,
    public navParams: NavParams,
    public platform: Platform,
    public wallet: Wallet
  ) {
    if (!this.platform.is('cordova')) {
      this.clipboard = {
        copy: (text) => {
          return webClipboard.writeText(text)
        },
        paste: () => {
          return Promise.reject(new Error('unsupported'))
        }
      }
    }
    this.refresh()
  }

  refresh() {
    this.xpub = this.wallet.getXpub()
    if (!this.xpub) {
      return
    }
    return this.wallet.getQR(this.xpub).then((url: string) => {
      this.qrCodeURL = url
    }).catch((err: any) => {
      console.log(err)
    })
  }

  copyXpub() {
    this.clipboard.copy(this.xpub)
  }

}
