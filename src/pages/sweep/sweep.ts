import { Component, ViewChild } from '@angular/core';
import { AlertController, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'
// import * as bip38 from 'bip38'
// import * as wif from 'wif'

/**
 * Generated class for the SweepPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-sweep',
  templateUrl: 'sweep.html',
})
export class SweepPage {
  @ViewChild('myAmount') myAmountEl
  public wif: string
  public wifInfo: { address: string, balance: number, utxos: any[] }
  public address: string
  public balance: number
  public canLeave: boolean = true

  constructor(
    public alertCtrl: AlertController,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
  }

  ionViewCanLeave() {
    return this.canLeave
  }

  async ionViewDidEnter() {
    this.wif = this.navParams.get('wif')
    let encrypted: boolean = this.navParams.get('encrypted')
    if (encrypted) {
      try {
        this.wif = await this.decryptWIF(this.wif)
      } catch (err) {
        if (err.message !== 'cancelled') {
          console.log(err)
        }
        await this.navCtrl.pop()
        return
      }
    }
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING_BALANCE')+'...'
    })
    await loader.present()
    try {
      let info: any = await this.wallet.getInfoFromWIF(this.wif)
      this.wifInfo = info
      this.address = info.address
      this.balance = info.balance
      this.myAmountEl.setFixedAmount(this.balance.toString())
      await loader.dismiss()
    } catch (err) {
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_GET_ADDR_BALANCE_FAILED')
      } else {
        message = this.translate.instant('ERR_LOAD_WIF_FAILED')
      }
      let errorAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: [{
          text: this.translate.instant('OK'),
          handler: () => {
            errorAlert.dismiss().then(() => {
              this.navCtrl.pop()
            })
            return false
          }
        }]
      })
      await loader.dismiss()
      await errorAlert.present()
    }
  }

  decryptWIF(encrypted: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let decryptAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('BIP38_PASSPHRASE'),
        inputs: [{
          name: 'passphrase',
          type: 'password'
        }],
        buttons: [{
          role: 'cancel',
          text: this.translate.instant('CANCEL'),
          handler: data => {
            decryptAlert.dismiss().then(() => {
              reject(new Error('cancelled'))
            })
            return false
          }
        }, {
          text: this.translate.instant('OK'),
          handler: data => {
            this._decrypt(encrypted, data.passphrase).then((result: string) => {
              decryptAlert.dismiss().then(() => {
                resolve(result)
              })
            }).catch(() => {})
            return false
          }
        }]
      })
      decryptAlert.present()
    })
  }

  async _decrypt(encrypted: string, passphrase: string): Promise<string> {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('DECRYPTING') + '...'
    })
    await loader.present()
    this.wallet.closeWallet()
    let result: string
    try {
      // let decrypted: any = bip38.decrypt(encrypted, passphrase)
      // result = wif.encode(0x80, decrypted.privateKey, decrypted.compressed)
    } catch (err) {

    }
    try {
      await this.wallet.startWallet()
      while (!this.wallet.isOffline() && !this.wallet.isOnline()) {
        await this.wallet.delay(500)
      }
    } catch (err) {

    }
    await loader.dismiss()
    if (result) {
      return result
    } else {
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_BIP38_PASSPHRASE'),
        buttons: [this.translate.instant('OK')]
      }).present()
      throw new Error('incorrect')
    }
  }

  async sweep() {
    this.canLeave = false
    await this.signAndBroadcast()
    this.canLeave = true
  }

  async signAndBroadcast() {
    let hex: string
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SIGNING')+"..."
    })
    await loader.present()
    try {
      let signedTx: any = await this.wallet.makeSweepTx(this.wif, this.wifInfo)
      hex = signedTx.hex
    } catch (err) {
      await loader.dismiss()
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_NOT_CONNECTED')
      } else if (err.message == 'not enough fund') {
        message = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else {
        message = this.translate.instant('ERR_CREATE_TX_FAILED')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: [this.translate.instant('OK')]
      }).present()
      return
    }
    if (await this.wallet.broadcastTx(hex, loader)) {
      this.navCtrl.popToRoot()
    }
  }

}
