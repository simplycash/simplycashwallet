import { Component } from '@angular/core';
import { AlertController, App, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'


@IonicPage()
@Component({
  selector: 'page-more',
  templateUrl: 'more.html',
})
export class MorePage {
  public walletName: string
  public isWatchOnly: boolean
  public isShowingAnnouncement: boolean = false

  constructor(
    public alertCtrl: AlertController,
    public app: App,
    public iab: InAppBrowser,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    this.walletName = this.wallet.getCurrentWalletName()
    this.isWatchOnly = this.wallet.isWatchOnly()
  }
  pushAddressesPage() {
    this.navCtrl.push('AddressesPage')
  }

  pushXpubPage() {
    this.navCtrl.push('XpubPage')
  }

  async promptForWIF(): Promise<void> {
    let wifAlert: any = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: 'WIF',
      inputs: [{
        name: 'wif'
      }],
      buttons: [{
        text: this.translate.instant('CANCEL')
      }, {
        text: this.translate.instant('OK'),
        handler: (data) => {
          let wif: string = data.wif
          let encrypted: boolean = false
          let isValid: boolean = false
          if (!wif) {

          } else if (this.wallet.validateWIF(wif)) {
            isValid = true
          } else if (this.wallet.validateEncryptedWIF(wif)) {
            isValid = true
            encrypted = true
          }
          if (isValid) {
            wifAlert.dismiss().then(() => {
              this.navCtrl.push('SweepPage', {
                encrypted: encrypted,
                wif: wif
              })
            })
          } else {
            this.alertCtrl.create({
              enableBackdropDismiss: false,
              title: this.translate.instant('ERROR'),
              buttons: [this.translate.instant('OK')]
            }).present()
          }
          return false
        }
      }]
    })
    await wifAlert.present()
  }

  async showWRP() {
    try {
      let m: string = await this.wallet.authorize()
      let o: any = this.wallet.parseRecoveryString(m)
      let message: string
      if (o.xprv) {
        message = 'account xprv:<br>' + o.xprv
      } else {
        message = this.translate.instant('RECOVERY_PHRASE') + ':<br>' + o.mnemonic + '<br><br>'
        if (o.passphrase) {
          o.passphrase = o.passphrase.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          message += this.translate.instant('RECOVERY_PASSPHRASE') + ':<br>' + o.passphrase + '<br><br>'
        }
        message += this.translate.instant('DERIVATION_PATH') + ':<br>' + o.path
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('BACKUP_WALLET'),
        message: message,
        buttons: [this.translate.instant('OK')]
      }).present()
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
    }
  }

  async renameCurrentWallet() {
    let renameAlert = this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('RENAME_WALLET'),
      inputs: [{
        name: 'name',
        value: this.walletName
      }],
      buttons: [{
        text: this.translate.instant('CANCEL')
      },{
        text: this.translate.instant('OK'),
        handler: data => {
          if (this.walletName === data.name) {
            return
          }
          if (data.name && this.nameIsValid(data.name)) {
            renameAlert.dismiss().then(() => {
              return this.wallet.renameWallet(this.walletName, data.name)
            }).catch((err) => {
              console.log(err)
            }).then(() => {
              this.walletName = this.wallet.getCurrentWalletName()
            })
          }
          return false
        }
      }]
    })
    await renameAlert.present()
  }

  nameIsValid(name: string) {
    if (this.wallet.getAllWalletNames().indexOf(name) !== -1) {
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_INVALID_WALLET_NAME'),
        buttons: [this.translate.instant('OK')]
      }).present()
      return false
    } else {
      return true
    }
  }

  async deleteCurrentWallet() {
    try {
      await this.confirmDelete()
      await this.wallet.deleteWallet(this.wallet.getCurrentWalletName())
      await this.navCtrl.popToRoot()
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
    }
  }

  confirmDelete() {
    return new Promise((resolve, reject) => {
      let confirmDeleteAlert = this.alertCtrl.create({
        enableBackdropDismiss: true,
        title: this.translate.instant('WARN_DELETE_WALLET'),
        buttons: [{
          role: 'cancel',
          text: this.translate.instant('CANCEL'),
          handler: data => {
            confirmDeleteAlert.dismiss().then(() => {
              reject(new Error('cancelled'))
            })
            return false
          }
        },{
          text: this.translate.instant('OK'),
          handler: data => {
            confirmDeleteAlert.dismiss().then(() => {
              resolve()
            })
            return false
          }
        }]
      })
      confirmDeleteAlert.present()
    })
  }

  async showColdWalletTutorial() {
    await this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('COLD_WALLET_TUTORIAL'),
      message: this.translate.instant('COLD_WALLET_TUTORIAL_CONTENT'),
      buttons: [this.translate.instant('OK')]
    }).present()
  }

  async showAnnouncement() {
    if (this.isShowingAnnouncement) {
      return
    }
    this.isShowingAnnouncement = true
    await this.wallet.showAnnouncement(true)
    this.isShowingAnnouncement = false
  }

  async showDisclaimer() {
    await this.alertCtrl.create({
      enableBackdropDismiss: false,
      title: this.translate.instant('DISCLAIMER'),
      message: this.translate.instant('DISCLAIMER_CONTENT'),
      buttons: [this.translate.instant('OK')]
    }).present()
  }

  launchTwitter() {
    this.iab.create('https://twitter.com/simplycashapp', '_system')
  }

  launchTelegram() {
    this.iab.create('https://t.me/simplycashgroup', '_system')
  }

}
