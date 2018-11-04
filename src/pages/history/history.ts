import { Component } from '@angular/core'
import { AlertController, IonicPage, NavController, Platform } from 'ionic-angular'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { LocalNotifications } from '@ionic-native/local-notifications'

import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-history',
  templateUrl: 'history.html'
})
export class HistoryPage {

  public static readonly pageName = 'HistoryPage'
  private currentUnit: string = this.wallet.getPreferredUnit()
  private balance: number
  private txs: { txid: string, date: string, time: string, delta: number, seen: boolean }[] = []
  private dateGroups: { date: string, txs: any[] }[] = []
  private updateCallback: Function

  constructor(
    public alertCtrl: AlertController,
    private iab: InAppBrowser,
    private localNotifications: LocalNotifications,
    public navCtrl: NavController,
    private platform: Platform,
    private wallet: Wallet
  ) {
    this.updateCallback = () => {
      this.refresh()
    }
    this.wallet.subscribeUpdate(this.updateCallback)
  }

  ionViewDidLoad() {
    if (this.platform.is('cordova')) {
      this.localNotifications.getAll().then((items: any) => {
        items.forEach((item: any) => {
          try {
            if (JSON.parse(item.data).page !== 'HistoryPage') {
              return
            }
          } catch (err) {
            return
          }
          this.localNotifications.clear(item.id).catch((err: any) => {
            console.log(err)
          })
        })
      }).catch((err: any) => {
        console.log(err)
      })
    }
  }

  ionViewDidLeave() {
    this.wallet.unsubscribeUpdate(this.updateCallback)
    this.wallet.seeTheUnseen()
  }

  refresh() {
    console.log('history refresh')
    this.balance = this.wallet.getCacheBalance()
    this.txs = this.transformTxs(this.wallet.getCacheHistory())
    this.dateGroups.length = 0

    let o: any = {}
    this.txs.forEach((tx: any) => {
      let date: string = tx.date
      if (!o[date]) {
        o[date] = []
      }
      o[date].push(tx)
    })
    if (typeof o['unknown'] !== 'undefined') {
      // this.dateGroups.push({
      //   date: 'unknown',
      //   txs: o['unknown']
      // })
      delete o['unknown']
    }
    for (let date in o) {
      this.dateGroups.push({
        date: date,
        txs: o[date]
      })
    }
  }

  transformTxs(txs: any[]) {
    return txs.map((tx: any) => {
      if (!tx.friendlyTimestamp) {
        return {
          txid: tx.txid,
          date: 'unknown',
          time: '',
          delta: tx.delta,
          seen: tx.seen
        }
      }
      let date: Date = new Date(tx.friendlyTimestamp * 1000)
      let dateStr: string = [date.getFullYear(), ('0'+(date.getMonth()+1)).slice(-2), ('0'+date.getDate()).slice(-2)].join('-')
      let timeStr: string = [('0'+date.getHours()).slice(-2), ('0'+date.getMinutes()).slice(-2)].join(':')
      return {
        txid: tx.txid,
        date: dateStr,
        time: timeStr,
        delta: tx.delta,
        seen: tx.seen
      }
    })
  }

  today() {
    let date: Date = new Date()
    return [date.getFullYear(), ('0'+(date.getMonth()+1)).slice(-2), ('0'+date.getDate()).slice(-2)].join('-')
  }

  changeUnit() {
    this.currentUnit = this.wallet.changePreferredUnit()
  }

  showTx(txid: string) {
    this.iab.create('https://blockchair.com/bitcoin-cash/transaction/'+txid, '_system')
  }
}
