import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams } from 'ionic-angular'
import { Clipboard } from '@ionic-native/clipboard'
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

  private xpub: string
  private qrCodeURL: string

  constructor(
    private clipboard: Clipboard,
    public navCtrl: NavController,
    public navParams: NavParams,
    private wallet: Wallet
  ) {
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
